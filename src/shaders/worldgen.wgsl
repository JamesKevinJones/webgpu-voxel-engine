// World generation compute pass.
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

// Integer surface height of the 32 columns (one z row) covered by this workgroup.
var<workgroup> columnSurface: array<i32, 32>;

fn terrainHeight(x: f32, z: f32, seed: u32) -> f32 {
  let continental = fbm2(x * 0.0035, z * 0.0035, 4u, seed);
  let hills = fbm2(x * 0.013, z * 0.013, 4u, seed + 101u) * 9.0;
  let ridge = ridged2(x * 0.0065, z * 0.0065, 5u, seed + 202u);
  let mountainMask = smoothstep(0.05, 0.45, continental);
  return 8.0 + continental * 26.0 + hills + ridge * ridge * 62.0 * mountainMask;
}

fn terrainBlock(x: i32, y: i32, z: i32, surface: i32, seed: u32) -> u32 {
  if (y > surface) {
    return select(BLOCK_AIR, BLOCK_WATER, y <= SEA_LEVEL);
  }
  let depth = surface - y;
  let fx = f32(x);
  let fy = f32(y);
  let fz = f32(z);
  if (y < surface - 4 && y > WORLD_MIN_Y + 2) {
    let n1 = simplex3(fx * 0.028, fy * 0.042, fz * 0.028, seed + 303u);
    let n2 = simplex3(fx * 0.028, fy * 0.042, fz * 0.028, seed + 404u);
    if (n1 * n1 + n2 * n2 < 0.01) {
      return BLOCK_AIR;
    }
  }
  let beach = surface <= SEA_LEVEL + 1;
  let rocky = surface > 64;
  if (depth == 0) {
    return select(select(BLOCK_GRASS, BLOCK_STONE, rocky), BLOCK_SAND, beach);
  }
  if (depth < 4) {
    return select(select(BLOCK_DIRT, BLOCK_STONE, rocky), BLOCK_SAND, beach);
  }
  if (fy < -34.0 + simplex3(fx * 0.04, fy * 0.04, fz * 0.04, seed + 505u) * 6.0) {
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

  if (li < 32u) {
    let h = terrainHeight(f32(origin.x + i32(li)), f32(origin.z + i32(lz)), params.seed);
    columnSurface[li] = i32(floor(h));
  }
  workgroupBarrier();

  let ly = (word >> 2u) & 31u;
  let lx0 = (word & 3u) * 8u;
  var packed = 0u;
  for (var k = 0u; k < 8u; k++) {
    let lx = lx0 + k;
    let block = terrainBlock(origin.x + i32(lx), origin.y + i32(ly), origin.z + i32(lz), columnSurface[lx], params.seed);
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
