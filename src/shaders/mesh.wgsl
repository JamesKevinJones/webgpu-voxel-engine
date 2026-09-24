// GPU greedy mesher with face culling, per-vertex ambient occlusion and smooth voxel lighting.
//
// Dispatch: (32 slices, 6 face directions, jobCount); one workgroup = one 32×32 slice of one face
// direction of one chunk, one invocation per row (phase 1) and per column (phase 2).
//
//  Phase 1  Each invocation walks its row, computes the face key of every cell and records maximal
//           runs of equal keys into workgroup memory at the run's start cell. A key has two words:
//             x: block id | four 2-bit corner AO levels << 5   (| run length << 16 in `runs`)
//             y: four corner light bytes (skylight << 4 | block light), smoothed over the four
//                voxels around each corner on the face's outer side.
//  Phase 2  Each invocation owns one run-start column and merges vertically adjacent runs with
//           identical start, length and key into a single quad.
//
// Quads are appended to the chunk's fixed-capacity region of one of three vertex pools (opaque,
// water, cutout) through atomic counters, and the matching drawIndexedIndirect record's indexCount
// is bumped atomically. Each pool keeps one light word per quad after its vertex region. Cross
// plants and torches are emitted as two diagonal quads by the +X workgroups. The same algorithm is
// implemented on the CPU in src/world/mesher.ts.

@group(0) @binding(0) var<storage, read> padded: array<u32>;
@group(0) @binding(1) var<storage, read> jobs: array<u32>;
@group(0) @binding(2) var<storage, read_write> opaqueVertices: array<u32>;
@group(0) @binding(3) var<storage, read_write> waterVertices: array<u32>;
@group(0) @binding(4) var<storage, read_write> cutoutVertices: array<u32>;
// drawIndexedIndirect records: MESH_POOLS per slot, pool order opaque, water, cutout.
@group(0) @binding(5) var<storage, read_write> indirectArgs: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> counters: array<atomic<u32>>;
// Padded (34³) light volumes uploaded by the CPU light engine, same layout as `padded`.
@group(0) @binding(7) var<storage, read> paddedLight: array<u32>;

// Number of mesh slots in the pools (the light words start after MESH_SLOTS * VERTEX_CAPACITY).
override MESH_SLOTS: u32 = 1u;

const KEY_AO_SHIFT: u32 = 5u;
const AO_OPEN_KEY: u32 = 0x1fe0u; // all four corners unoccluded (level 3)

var<workgroup> runs: array<vec2<u32>, 1024>;
var<private> paddedBase: u32;

fn paddedIndexOf(p: vec3<i32>) -> u32 {
  return u32((p.x + 1) + PADDED_SIZE_I * ((p.y + 1) + PADDED_SIZE_I * (p.z + 1)));
}

// Voxel at chunk-local coordinates in [-1, 32].
fn sampleVoxel(p: vec3<i32>) -> u32 {
  let idx = paddedIndexOf(p);
  return (padded[paddedBase + (idx >> 2u)] >> ((idx & 3u) * 8u)) & 0xffu;
}

// Light byte (sky << 4 | block) at chunk-local coordinates in [-1, 32].
fn sampleLight(p: vec3<i32>) -> u32 {
  let idx = paddedIndexOf(p);
  return (paddedLight[paddedBase + (idx >> 2u)] >> ((idx & 3u) * 8u)) & 0xffu;
}

fn isOpaqueBlock(b: u32) -> bool {
  return blockRenderClass(b) == RC_OPAQUE;
}

fn isWaterBlock(b: u32) -> bool {
  return b == BLOCK_WATER || (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FALLING);
}

// Water surface height in eighths (8 = full cell).
fn waterSurface(b: u32) -> u32 {
  if (b >= BLOCK_WATER_FLOW1 && b <= BLOCK_WATER_FLOW7) {
    return 8u - (b - BLOCK_WATER_FLOW1 + 1u);
  }
  return select(0u, 8u, isWaterBlock(b));
}

// Mirrors isFaceVisible() in src/world/block.ts.
fn isFaceVisible(block: u32, neighbor: u32, dir: u32) -> bool {
  let cls = blockRenderClass(block);
  if (cls == RC_OPAQUE) {
    return !isOpaqueBlock(neighbor);
  }
  if (cls == RC_CUTOUT) {
    return !isOpaqueBlock(neighbor) && neighbor != block;
  }
  if (cls == RC_WATER) {
    if (neighbor == BLOCK_AIR || blockRenderClass(neighbor) == RC_CROSS) {
      return true;
    }
    if (isWaterBlock(neighbor)) {
      return dir != 2u && dir != 3u && waterSurface(neighbor) < waterSurface(block);
    }
    return dir == 2u && waterSurface(block) < 8u;
  }
  return false;
}

fn occluder(p: vec3<i32>) -> u32 {
  return select(0u, 1u, isOpaqueBlock(sampleVoxel(p)));
}

fn axisVector(axis: u32) -> vec3<i32> {
  var v = vec3<i32>(0, 0, 0);
  v[axis] = 1;
  return v;
}

// Rounded mean of `sum` over `n` samples.
fn roundedMean(sum: u32, n: u32) -> u32 {
  return (sum * 2u + n) / (n * 2u);
}

fn faceKey(dir: u32, s: i32, i: i32, j: i32) -> vec2<u32> {
  let a = dir >> 1u;
  let u = (a + 1u) % 3u;
  let v = (a + 2u) % 3u;
  var p = vec3<i32>(0, 0, 0);
  p[a] = s;
  p[u] = i;
  p[v] = j;
  let block = sampleVoxel(p);
  if (block == BLOCK_AIR) {
    return vec2<u32>(0u, 0u);
  }
  let q = p + axisVector(a) * select(1, -1, (dir & 1u) == 1u);
  let neighbor = sampleVoxel(q);
  if (!isFaceVisible(block, neighbor, dir)) {
    return vec2<u32>(0u, 0u);
  }
  let U = axisVector(u);
  let V = axisVector(v);
  let water = isWaterBlock(block);
  var key = block;
  if (water) {
    key |= AO_OPEN_KEY;
  }
  var light = 0u;
  let lq = sampleLight(q);
  for (var c = 0u; c < 4u; c++) {
    let du = select(-1, 1, c == 1u || c == 2u);
    let dv = select(-1, 1, c >= 2u);
    let side1 = occluder(q + U * du);
    let side2 = occluder(q + V * dv);
    let corner = occluder(q + U * du + V * dv);
    if (!water) {
      let ao = select(3u - (side1 + side2 + corner), 0u, side1 == 1u && side2 == 1u);
      key |= ao << (KEY_AO_SHIFT + c * 2u);
    }
    // Smooth light: average of the transparent voxels around the corner.
    var sky = lq >> 4u;
    var blk = lq & 15u;
    var n = 1u;
    if (side1 == 0u) {
      let l = sampleLight(q + U * du);
      sky += l >> 4u;
      blk += l & 15u;
      n += 1u;
    }
    if (side2 == 0u) {
      let l = sampleLight(q + V * dv);
      sky += l >> 4u;
      blk += l & 15u;
      n += 1u;
    }
    if (corner == 0u && !(side1 == 1u && side2 == 1u)) {
      let l = sampleLight(q + U * du + V * dv);
      sky += l >> 4u;
      blk += l & 15u;
      n += 1u;
    }
    light |= ((roundedMean(sky, n) << 4u) | roundedMean(blk, n)) << (c * 8u);
  }
  return vec2<u32>(key, light);
}

fn poolCapacity(pool: u32) -> vec2<u32> {
  if (pool == 1u) {
    return vec2<u32>(WATER_QUAD_CAPACITY, WATER_VERTEX_CAPACITY);
  }
  if (pool == 2u) {
    return vec2<u32>(CUTOUT_QUAD_CAPACITY, CUTOUT_VERTEX_CAPACITY);
  }
  return vec2<u32>(OPAQUE_QUAD_CAPACITY, OPAQUE_VERTEX_CAPACITY);
}

// Reserves a quad in `pool`; returns the first vertex index, or 0xffffffff when full.
fn reserveQuad(slot: u32, pool: u32) -> u32 {
  let quad = atomicAdd(&counters[slot * MESH_COUNTER_WORDS + pool], 1u);
  let cap = poolCapacity(pool);
  if (quad >= cap.x) {
    return 0xffffffffu; // Slot full: the overflow is visible to the CPU through the counter.
  }
  atomicAdd(&indirectArgs[(slot * MESH_POOLS + pool) * INDIRECT_ARGS_WORDS], 6u);
  return slot * cap.y + quad * 4u;
}

fn writeWord(pool: u32, index: u32, value: u32) {
  if (pool == 0u) {
    opaqueVertices[index] = value;
  } else if (pool == 1u) {
    waterVertices[index] = value;
  } else {
    cutoutVertices[index] = value;
  }
}

// Light word of the quad whose first vertex is `base`.
fn writeQuadLight(pool: u32, base: u32, light: u32) {
  writeWord(pool, MESH_SLOTS * poolCapacity(pool).y + (base >> 2u), light);
}

fn poolOf(block: u32) -> u32 {
  let cls = blockRenderClass(block);
  if (cls == RC_WATER) {
    return 1u;
  }
  if (cls == RC_CUTOUT || cls == RC_CROSS) {
    return 2u;
  }
  return 0u;
}

fn packVertex(p: vec3<u32>, face: u32, ao: u32, block: u32) -> u32 {
  return p.x | (p.y << 6u) | (p.z << 12u) | (face << 18u) | (ao << 21u) | (block << 23u);
}

fn emitQuad(slot: u32, dir: u32, s: u32, i: u32, j: u32, w: u32, h: u32, key: vec2<u32>) {
  let block = key.x & 31u;
  let pool = poolOf(block);
  let base = reserveQuad(slot, pool);
  if (base == 0xffffffffu) {
    return;
  }
  let a = dir >> 1u;
  let u = (a + 1u) % 3u;
  let v = (a + 2u) % 3u;
  let negative = (dir & 1u) == 1u;
  let plane = select(s + 1u, s, negative);
  let ao = vec4<u32>(
    (key.x >> KEY_AO_SHIFT) & 3u,
    (key.x >> (KEY_AO_SHIFT + 2u)) & 3u,
    (key.x >> (KEY_AO_SHIFT + 4u)) & 3u,
    (key.x >> (KEY_AO_SHIFT + 6u)) & 3u,
  );
  // Rotate the quad so its shared diagonal joins the brighter corners (AO anisotropy fix).
  let rotate = select(0u, 1u, ao.x + ao.z < ao.y + ao.w);
  var light = 0u;
  for (var k = 0u; k < 4u; k++) {
    let order = (k + rotate) & 3u;
    // Positive faces: (0,0) (1,0) (1,1) (0,1); negative faces reverse the winding.
    let corner = select(order, (4u - order) & 3u, negative);
    let cu = select(0u, 1u, corner == 1u || corner == 2u);
    let cv = select(0u, 1u, corner >= 2u);
    var pos = vec3<u32>(0u, 0u, 0u);
    pos[a] = plane;
    pos[u] = i + cu * w;
    pos[v] = j + cv * h;
    writeWord(pool, base + k, packVertex(pos, dir, ao[corner], block));
    light |= ((key.y >> (corner * 8u)) & 0xffu) << (k * 8u);
  }
  writeQuadLight(pool, base, light);
}

// Two diagonal quads (face codes 6 and 7) for a cross plant or torch at cell p. Mirrors emitCross().
fn emitCross(slot: u32, p: vec3<u32>, block: u32) {
  let l = sampleLight(vec3<i32>(p));
  let light = l | (l << 8u) | (l << 16u) | (l << 24u);
  let a = reserveQuad(slot, 2u);
  if (a != 0xffffffffu) {
    writeWord(2u, a, packVertex(p, 6u, 3u, block));
    writeWord(2u, a + 1u, packVertex(p + vec3<u32>(1u, 0u, 1u), 6u, 3u, block));
    writeWord(2u, a + 2u, packVertex(p + vec3<u32>(1u, 1u, 1u), 6u, 3u, block));
    writeWord(2u, a + 3u, packVertex(p + vec3<u32>(0u, 1u, 0u), 6u, 3u, block));
    writeQuadLight(2u, a, light);
  }
  let b = reserveQuad(slot, 2u);
  if (b != 0xffffffffu) {
    writeWord(2u, b, packVertex(p + vec3<u32>(1u, 0u, 0u), 7u, 3u, block));
    writeWord(2u, b + 1u, packVertex(p + vec3<u32>(0u, 0u, 1u), 7u, 3u, block));
    writeWord(2u, b + 2u, packVertex(p + vec3<u32>(0u, 1u, 1u), 7u, 3u, block));
    writeWord(2u, b + 3u, packVertex(p + vec3<u32>(1u, 1u, 0u), 7u, 3u, block));
    writeQuadLight(2u, b, light);
  }
}

@compute @workgroup_size(32)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) t: u32) {
  let s = wg.x;
  let dir = wg.y;
  let job = wg.z;
  paddedBase = job * PADDED_WORDS;
  let slot = jobs[job * MESH_JOB_WORDS];

  // Phase 1: maximal runs of identical face keys along row t.
  for (var i = 0u; i < CHUNK_SIZE; i++) {
    runs[t * CHUNK_SIZE + i] = vec2<u32>(0u, 0u);
  }
  var runKey = vec2<u32>(0u, 0u);
  var runStart = 0u;
  for (var i = 0u; i <= CHUNK_SIZE; i++) {
    var key = vec2<u32>(0u, 0u);
    if (i < CHUNK_SIZE) {
      key = faceKey(dir, i32(s), i32(i), i32(t));
      // +X workgroups also emit cross plants of their slice (cell x = s, y = i, z = t).
      if (dir == 0u) {
        let cell = vec3<u32>(s, i, t);
        let block = sampleVoxel(vec3<i32>(cell));
        if (blockRenderClass(block) == RC_CROSS) {
          emitCross(slot, cell, block);
        }
      }
    }
    if (any(key != runKey)) {
      if (runKey.x != 0u) {
        runs[t * CHUNK_SIZE + runStart] = vec2<u32>(runKey.x | ((i - runStart) << 16u), runKey.y);
      }
      runKey = key;
      runStart = i;
    }
  }
  workgroupBarrier();

  // Phase 2: merge identical runs that start in column t down the slice.
  var open = vec2<u32>(0u, 0u);
  var startJ = 0u;
  for (var j = 0u; j <= CHUNK_SIZE; j++) {
    var r = vec2<u32>(0u, 0u);
    if (j < CHUNK_SIZE) {
      r = runs[j * CHUNK_SIZE + t];
    }
    if (open.x != 0u && all(r == open)) {
      continue;
    }
    if (open.x != 0u) {
      emitQuad(slot, dir, s, t, startJ, open.x >> 16u, j - startJ, vec2<u32>(open.x & 0xffffu, open.y));
    }
    open = r;
    startJ = j;
  }
}
