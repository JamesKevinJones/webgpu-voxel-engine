// GPU greedy mesher with face culling and per-vertex ambient occlusion.
//
// Dispatch: (32 slices, 6 face directions, jobCount); one workgroup = one 32×32 slice of one face
// direction of one chunk, one invocation per row (phase 1) and per column (phase 2).
//
//  Phase 1  Each invocation walks its row, computes the face key of every cell (block id plus
//           the four corner AO levels from the 26-neighbourhood) and records maximal runs of equal
//           keys into workgroup memory at the run's start cell: key | length << 16.
//  Phase 2  Each invocation owns one run-start column and merges vertically adjacent runs with
//           identical start, length and key into a single quad.
//
// Quads are appended to the chunk's fixed-capacity region of the vertex pool through atomic
// counters, and the matching drawIndexedIndirect record's indexCount is bumped atomically.
// The same algorithm is implemented on the CPU in src/world/mesher.ts.

@group(0) @binding(0) var<storage, read> padded: array<u32>;
@group(0) @binding(1) var<storage, read> jobs: array<u32>;
@group(0) @binding(2) var<storage, read_write> opaqueVertices: array<u32>;
@group(0) @binding(3) var<storage, read_write> waterVertices: array<u32>;
@group(0) @binding(4) var<storage, read_write> opaqueArgs: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> waterArgs: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> counters: array<atomic<u32>>;

const AO_OPEN_KEY: u32 = 0xff0u; // all four corners unoccluded (level 3)

var<workgroup> runs: array<u32, 1024>;
var<private> paddedBase: u32;

// Voxel at chunk-local coordinates in [-1, 32].
fn sampleVoxel(p: vec3<i32>) -> u32 {
  let idx = u32((p.x + 1) + PADDED_SIZE_I * ((p.y + 1) + PADDED_SIZE_I * (p.z + 1)));
  return (padded[paddedBase + (idx >> 2u)] >> ((idx & 3u) * 8u)) & 0xffu;
}

fn isOpaqueBlock(b: u32) -> bool {
  return b != BLOCK_AIR && b != BLOCK_WATER;
}

fn occluder(p: vec3<i32>) -> u32 {
  return select(0u, 1u, isOpaqueBlock(sampleVoxel(p)));
}

fn axisVector(axis: u32) -> vec3<i32> {
  var v = vec3<i32>(0, 0, 0);
  v[axis] = 1;
  return v;
}

fn faceKey(dir: u32, s: i32, i: i32, j: i32) -> u32 {
  let a = dir >> 1u;
  let u = (a + 1u) % 3u;
  let v = (a + 2u) % 3u;
  var p = vec3<i32>(0, 0, 0);
  p[a] = s;
  p[u] = i;
  p[v] = j;
  let block = sampleVoxel(p);
  if (block == BLOCK_AIR) {
    return 0u;
  }
  let q = p + axisVector(a) * select(1, -1, (dir & 1u) == 1u);
  let neighbor = sampleVoxel(q);
  let opaque = isOpaqueBlock(block);
  let visible = select(neighbor == BLOCK_AIR, !isOpaqueBlock(neighbor), opaque);
  if (!visible) {
    return 0u;
  }
  if (!opaque) {
    return block | AO_OPEN_KEY;
  }
  let U = axisVector(u);
  let V = axisVector(v);
  var key = block;
  for (var c = 0u; c < 4u; c++) {
    let du = select(-1, 1, c == 1u || c == 2u);
    let dv = select(-1, 1, c >= 2u);
    let side1 = occluder(q + U * du);
    let side2 = occluder(q + V * dv);
    let corner = occluder(q + U * du + V * dv);
    let ao = select(3u - (side1 + side2 + corner), 0u, side1 == 1u && side2 == 1u);
    key |= ao << (4u + c * 2u);
  }
  return key;
}

fn emitQuad(slot: u32, dir: u32, s: u32, i: u32, j: u32, w: u32, h: u32, key: u32) {
  let block = key & 15u;
  let water = block == BLOCK_WATER;
  let quad = atomicAdd(&counters[slot * MESH_COUNTER_WORDS + select(0u, 1u, water)], 1u);
  if (quad >= select(OPAQUE_QUAD_CAPACITY, WATER_QUAD_CAPACITY, water)) {
    return; // Slot full: the overflow is visible to the CPU through the counter.
  }
  let a = dir >> 1u;
  let u = (a + 1u) % 3u;
  let v = (a + 2u) % 3u;
  let negative = (dir & 1u) == 1u;
  let plane = select(s + 1u, s, negative);
  let ao = vec4<u32>((key >> 4u) & 3u, (key >> 6u) & 3u, (key >> 8u) & 3u, (key >> 10u) & 3u);
  // Rotate the quad so its shared diagonal joins the brighter corners (AO anisotropy fix).
  let rotate = select(0u, 1u, ao.x + ao.z < ao.y + ao.w);
  var base = 0u;
  if (water) {
    base = slot * WATER_VERTEX_CAPACITY + quad * 4u;
  } else {
    base = slot * OPAQUE_VERTEX_CAPACITY + quad * 4u;
  }
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
    let packed = pos.x | (pos.y << 6u) | (pos.z << 12u) | (dir << 18u) | (ao[corner] << 21u) | (block << 23u);
    if (water) {
      waterVertices[base + k] = packed;
    } else {
      opaqueVertices[base + k] = packed;
    }
  }
  if (water) {
    atomicAdd(&waterArgs[slot * INDIRECT_ARGS_WORDS], 6u);
  } else {
    atomicAdd(&opaqueArgs[slot * INDIRECT_ARGS_WORDS], 6u);
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
    runs[t * CHUNK_SIZE + i] = 0u;
  }
  var runKey = 0u;
  var runStart = 0u;
  for (var i = 0u; i <= CHUNK_SIZE; i++) {
    var key = 0u;
    if (i < CHUNK_SIZE) {
      key = faceKey(dir, i32(s), i32(i), i32(t));
    }
    if (key != runKey) {
      if (runKey != 0u) {
        runs[t * CHUNK_SIZE + runStart] = runKey | ((i - runStart) << 16u);
      }
      runKey = key;
      runStart = i;
    }
  }
  workgroupBarrier();

  // Phase 2: merge identical runs that start in column t down the slice.
  var open = 0u;
  var startJ = 0u;
  for (var j = 0u; j <= CHUNK_SIZE; j++) {
    var r = 0u;
    if (j < CHUNK_SIZE) {
      r = runs[j * CHUNK_SIZE + t];
    }
    if (open != 0u && r == open) {
      continue;
    }
    if (open != 0u) {
      emitQuad(slot, dir, s, t, startJ, open >> 16u, j - startJ, open & 0xffffu);
    }
    open = r;
    startJ = j;
  }
}
