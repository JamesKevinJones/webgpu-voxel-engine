// World generation compute pass (mirrors src/world/terrain.ts).
// One invocation fills one 32-bit word of a chunk's voxel slot = 8 voxels along X at 4 bits each,
// using an identity palette (palette index == block id). Dispatch: (64, jobCount, 1).
#include "noise.wgsl"

struct GenParams {
  seed: u32,
  jobCount: u32,
  pad0: u32,
  pad1: u32,
}

struct GenJob {
  chunk: vec3<i32>,
  slot: u32,
}

@group(0) @binding(0) var<uniform> params: GenParams;
@group(0) @binding(1) var<storage, read> jobs: array<GenJob>;
@group(0) @binding(2) var<storage, read_write> voxels: array<u32>;

// Per-workgroup caches: columnHeight height of the 32 columns of this z row, and the trees of the four
// TREE_CELL-wide cells those columns fall into (a workgroup never straddles a tree cell in z).
var<workgroup> columnTarget: array<f32, 32>;
var<workgroup> treeData: array<vec4<i32>, 4>; // x, z, base, top (base = TREE_NONE when absent)

const TREE_NONE: i32 = -100000;

fn continentalHeight(c: f32) -> f32 {
  var cs = array<f32, 8>(-1.0, -0.4, -0.15, -0.04, 0.1, 0.35, 0.6, 1.0);
  var hs = array<f32, 8>(-38.0, -22.0, -6.0, 1.0, 5.0, 12.0, 20.0, 28.0);
  var h = hs[0];
  for (var i = 0; i < 7; i++) {
    let c0 = cs[i];
    let c1 = cs[i + 1];
    if (c >= c0) {
      h = hs[i] + (hs[i + 1] - hs[i]) * min((c - c0) / (c1 - c0), 1.0);
    }
  }
  return h;
}

fn targetHeight(x: f32, z: f32, seed: u32) -> f32 {
  let c = fbm2(x * 0.0022, z * 0.0022, 5u, seed);
  let erosion = fbm2(x * 0.0045, z * 0.0045, 3u, seed + 11u) * 0.5 + 0.5;
  let roughness = 1.0 - smoothstep(0.4, 0.75, erosion);
  let land = smoothstep(-0.12, 0.08, c);
  let hills = fbm2(x * 0.013, z * 0.013, 4u, seed + 22u) * 11.0 * (0.25 + 0.75 * roughness) * (0.35 + 0.65 * land);
  let ridge = ridged2(x * 0.0048, z * 0.0048, 5u, seed + 33u);
  let mountains = ridge * ridge * 64.0 * smoothstep(0.18, 0.5, c) * roughness;
  return continentalHeight(c) + hills + mountains;
}

fn terrainDensity(x: i32, y: i32, z: i32, columnHeight: f32, seed: u32) -> f32 {
  return columnHeight - f32(y) + simplex3(f32(x) * 0.03, f32(y) * 0.03, f32(z) * 0.03, seed + 44u) * DETAIL_AMPLITUDE;
}

fn isCave(x: i32, y: i32, z: i32, density: f32, seed: u32) -> bool {
  if (y < CAVE_MIN_Y || y > CAVE_MAX_Y || density <= CAVE_MIN_DENSITY) {
    return false;
  }
  let fy = f32(y);
  let fade = smoothstep(-40.0, -34.0, fy) * (1.0 - smoothstep(14.0, 20.0, fy));
  let px = f32(x) * 0.022;
  let py = fy * 0.034;
  let pz = f32(z) * 0.022;
  let w1 = simplex3(px, py, pz, seed + 55u) + 0.5 * simplex3(px * 2.0, py * 2.0, pz * 2.0, seed + 56u);
  let w2 = simplex3(px, py, pz, seed + 66u) + 0.5 * simplex3(px * 2.0, py * 2.0, pz * 2.0, seed + 67u);
  let ridge1 = 1.0 - abs(w1);
  let ridge2 = 1.0 - abs(w2);
  let threshold = 1.0 - 0.11 * fade;
  return ridge1 > threshold && ridge2 > threshold;
}

fn columnSurface(x: i32, z: i32, columnHeight: f32, seed: u32) -> i32 {
  let base = i32(floor(columnHeight));
  for (var y = base + SURFACE_SEARCH; y >= base - SURFACE_SEARCH; y--) {
    if (terrainDensity(x, y, z, columnHeight, seed) > 0.0) {
      return y;
    }
  }
  return base - SURFACE_SEARCH - 1;
}

fn treeInCell(cellX: i32, cellZ: i32, seed: u32) -> vec4<i32> {
  let h = hash3(cellX, 1, cellZ, seed + 77u);
  if (((h >> 4u) & 255u) >= 90u) {
    return vec4<i32>(0, 0, TREE_NONE, 0);
  }
  let x = cellX * TREE_CELL + 2 + i32(h & 3u);
  let z = cellZ * TREE_CELL + 2 + i32((h >> 2u) & 3u);
  let base = columnSurface(x, z, targetHeight(f32(x), f32(z), seed), seed);
  if (base <= BEACH_MAX_Y || base > GRASS_MAX_Y) {
    return vec4<i32>(0, 0, TREE_NONE, 0);
  }
  return vec4<i32>(x, z, base, base + 4 + i32((h >> 12u) % 3u));
}

fn treeBlock(x: i32, y: i32, z: i32, tree: vec4<i32>, seed: u32) -> u32 {
  if (tree.z == TREE_NONE) {
    return BLOCK_AIR;
  }
  let dx = abs(x - tree.x);
  let dz = abs(z - tree.y);
  if (dx == 0 && dz == 0 && y > tree.z && y <= tree.w) {
    return BLOCK_WOOD;
  }
  let dy = y - tree.w;
  if (dy >= -2 && dy <= -1 && dx <= 2 && dz <= 2) {
    let corner = dx == 2 && dz == 2;
    if (!corner || (hash3(x, y, z, seed + 88u) & 1u) == 0u) {
      return BLOCK_LEAVES;
    }
  }
  if (dy >= 0 && dy <= 1 && dx <= 1 && dz <= 1 && !(dy == 1 && dx == 1 && dz == 1)) {
    return BLOCK_LEAVES;
  }
  return BLOCK_AIR;
}

fn terrainBlock(x: i32, y: i32, z: i32, columnHeight: f32, tree: vec4<i32>, seed: u32) -> u32 {
  let density = terrainDensity(x, y, z, columnHeight, seed);
  if (density <= 0.0) {
    let t = treeBlock(x, y, z, tree, seed);
    if (t != BLOCK_AIR) {
      return t;
    }
    return select(BLOCK_AIR, BLOCK_WATER, y <= SEA_LEVEL);
  }
  if (y <= WORLD_MIN_Y + i32(hash3(x, 0, z, seed + 99u) % 3u)) {
    return BLOCK_BEDROCK;
  }
  if (isCave(x, y, z, density, seed)) {
    return BLOCK_AIR;
  }
  let top = terrainDensity(x, y + 1, z, columnHeight, seed) <= 0.0;
  let shallow = terrainDensity(x, y + 4, z, columnHeight, seed) <= 0.0;
  if (top || shallow) {
    if (y <= BEACH_MAX_Y) {
      return BLOCK_SAND;
    }
    if (y > GRASS_MAX_Y) {
      return BLOCK_STONE;
    }
    return select(BLOCK_DIRT, BLOCK_GRASS, top);
  }
  let fx = f32(x) * 0.04;
  let fy = f32(y) * 0.04;
  let fz = f32(z) * 0.04;
  if (f32(y) < -44.0 + simplex3(fx, fy, fz, seed + 111u) * 4.0) {
    return BLOCK_BASALT;
  }
  return BLOCK_STONE;
}

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let job = jobs[wg.y];
  let word = wg.x * 64u + li; // 0 .. 4095
  let origin = job.chunk * CHUNK_SIZE_I;
  let lz = word >> 7u; // constant across the workgroup (64 words never straddle a z slice)
  let wz = origin.z + i32(lz);

  if (li < 32u) {
    columnTarget[li] = targetHeight(f32(origin.x + i32(li)), f32(wz), params.seed);
  } else if (li < 36u) {
    let cellX = origin.x / TREE_CELL + i32(li - 32u);
    let cellZ = i32(floor(f32(wz) / f32(TREE_CELL)));
    treeData[li - 32u] = treeInCell(cellX, cellZ, params.seed);
  }
  workgroupBarrier();

  let ly = (word >> 2u) & 31u;
  let lx0 = (word & 3u) * 8u;
  let tree = treeData[lx0 / u32(TREE_CELL)];
  var packed = 0u;
  for (var k = 0u; k < 8u; k++) {
    let lx = lx0 + k;
    let block = terrainBlock(origin.x + i32(lx), origin.y + i32(ly), wz, columnTarget[lx], tree, params.seed);
    packed |= block << (k * 4u);
  }
  let base = job.slot * SLOT_WORDS;
  voxels[base + GPU_DATA_OFFSET + word] = packed;

  // Header: 4 bits per index, 16-entry identity palette.
  if (word < GPU_DATA_OFFSET) {
    var value = 0u;
    if (word == 0u) {
      value = 4u;
    } else if (word == 1u) {
      value = 16u;
    } else if (word >= GPU_PALETTE_OFFSET) {
      value = word - GPU_PALETTE_OFFSET;
    }
    voxels[base + word] = value;
  }
}
