// World generation compute pass (mirrors src/world/terrain.ts).
// One invocation fills one 32-bit word of a chunk's voxel slot = 4 voxels along X at 8 bits each,
// using an identity palette (palette index == block id). Dispatch: (128, jobCount, 1).
#include "climate.wgsl"

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

// Per-workgroup caches: target height and biome of the 32 columns of this z row, and the trees of
// the four TREE_CELL-wide cells those columns fall into (a workgroup never straddles a cell in z).
var<workgroup> columnTarget: array<f32, 32>;
var<workgroup> columnBiome: array<u32, 32>;
var<workgroup> treeData: array<vec4<i32>, 4>; // x, z, base, top (base = TREE_NONE when absent)
var<workgroup> treeKind: array<u32, 4>;

const TREE_NONE: i32 = -100000;
const TREE_OAK: u32 = 0u;
const TREE_BIRCH: u32 = 1u;
const TREE_PINE: u32 = 2u;
const TREE_CACTUS: u32 = 3u;

struct Column {
  target_height: f32,
  biome: u32,
}

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

fn column(x: f32, z: f32, seed: u32) -> Column {
  let w = biomeWeights(temperatureAt(x, z, seed), humidityAt(x, z, seed));
  let c = fbm2(x * 0.0022, z * 0.0022, 5u, seed);
  let erosion = fbm2(x * 0.0045, z * 0.0045, 3u, seed + 11u) * 0.5 + 0.5;
  let roughness = 1.0 - smoothstep(0.4, 0.75, erosion);
  let land = smoothstep(-0.12, 0.08, c);
  let hillAmp = w.x * 7.0 + w.y * 4.0 + w.z * 12.0 + w.w * 10.0;
  let hills = fbm2(x * 0.013, z * 0.013, 4u, seed + 22u) * hillAmp * (0.3 + 0.7 * roughness) * (0.35 + 0.65 * land);
  let ridge = ridged2(x * 0.0048, z * 0.0048, 4u, seed + 33u);
  let mountainAmp = 64.0 * (0.75 + 0.6 * w.z - 0.45 * w.y);
  let mountains = ridge * ridge * mountainAmp * smoothstep(0.18, 0.5, c) * roughness;
  let dunes = ridged2(x * 0.018, z * 0.03, 2u, seed + 44u) * 6.0 * w.y * land;
  return Column(continentalHeight(c) + hills + mountains + dunes, dominantBiome(w));
}

fn detailAmplitude(y: f32) -> f32 {
  return DETAIL_AMPLITUDE * (1.0 - 0.75 * smoothstep(DETAIL_FADE_START, DETAIL_FADE_END, y));
}

fn terrainDensity(x: i32, y: i32, z: i32, height: f32, seed: u32) -> f32 {
  let fy = f32(y);
  return height - fy + simplex3(f32(x) * 0.03, fy * 0.03, f32(z) * 0.03, seed + 45u) * detailAmplitude(fy);
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

fn columnSurface(x: i32, z: i32, height: f32, seed: u32) -> i32 {
  let base = i32(floor(height));
  for (var y = base + SURFACE_SEARCH; y >= base - SURFACE_SEARCH; y--) {
    if (terrainDensity(x, y, z, height, seed) > 0.0) {
      return y;
    }
  }
  return base - SURFACE_SEARCH - 1;
}

fn surfaceHeight(x: i32, z: i32, seed: u32) -> i32 {
  return columnSurface(x, z, column(f32(x), f32(z), seed).target_height, seed);
}

fn surfaceBlock(y: i32, biome: u32) -> u32 {
  if (biome == BIOME_SNOWY) {
    return select(BLOCK_SNOW, BLOCK_STONE, y > PEAK_Y);
  }
  if (y <= BEACH_MAX_Y || biome == BIOME_DESERT) {
    return BLOCK_SAND;
  }
  if (y > GRASS_MAX_Y) {
    return BLOCK_STONE;
  }
  return BLOCK_GRASS;
}

// Mirrors treeInCell(): returns (x, z, base, top) and writes the kind; base = TREE_NONE if absent.
fn treeInCell(cellX: i32, cellZ: i32, seed: u32, kindOut: ptr<function, u32>) -> vec4<i32> {
  let none = vec4<i32>(0, 0, TREE_NONE, 0);
  let h = hash3(cellX, 1, cellZ, seed + 77u);
  let x = cellX * TREE_CELL + TREE_RADIUS + i32(h & 3u);
  let z = cellZ * TREE_CELL + TREE_RADIUS + i32((h >> 2u) & 3u);
  let col = column(f32(x), f32(z), seed);
  let biome = col.biome;
  var chance = array<u32, 4>(26u, 46u, 90u, 218u);
  if (((h >> 4u) & 255u) >= chance[biome]) {
    return none;
  }
  let base = columnSurface(x, z, col.target_height, seed);
  let ground = surfaceBlock(base, biome);
  var kind = TREE_OAK;
  if (biome == BIOME_DESERT) {
    if (ground != BLOCK_SAND || base <= BEACH_MAX_Y) {
      return none;
    }
    kind = TREE_CACTUS;
  } else if (biome == BIOME_SNOWY) {
    if (ground != BLOCK_SNOW || base <= BEACH_MAX_Y) {
      return none;
    }
    kind = TREE_PINE;
  } else {
    if (ground != BLOCK_GRASS) {
      return none;
    }
    if (biome == BIOME_FOREST && ((h >> 20u) & 1u) == 1u) {
      kind = TREE_BIRCH;
    }
  }
  var heights = array<i32, 4>(4, 5, 6, 2);
  let variation = select(3u, 4u, kind == TREE_PINE);
  let top = base + heights[kind] + i32((h >> 12u) % variation);
  if (top + 3 > WORLD_MAX_Y) {
    return none;
  }
  // Clearance: no cliff face may cut through the canopy.
  var offsets = array<vec2<i32>, 4>(
    vec2<i32>(TREE_RADIUS, 0), vec2<i32>(-TREE_RADIUS, 0), vec2<i32>(0, TREE_RADIUS), vec2<i32>(0, -TREE_RADIUS));
  for (var i = 0; i < 4; i++) {
    if (surfaceHeight(x + offsets[i].x, z + offsets[i].y, seed) > base + 2) {
      return none;
    }
  }
  *kindOut = kind;
  return vec4<i32>(x, z, base, top);
}

fn treeBlock(x: i32, y: i32, z: i32, tree: vec4<i32>, kind: u32, seed: u32) -> u32 {
  if (tree.z == TREE_NONE) {
    return BLOCK_AIR;
  }
  let dx = abs(x - tree.x);
  let dz = abs(z - tree.y);
  if (dx == 0 && dz == 0 && y > tree.z && y <= tree.w) {
    var trunks = array<u32, 4>(BLOCK_WOOD, BLOCK_BIRCH_WOOD, BLOCK_PINE_WOOD, BLOCK_CACTUS);
    return trunks[kind];
  }
  let dy = y - tree.w;
  if (kind == TREE_CACTUS) {
    return BLOCK_AIR;
  }
  if (kind == TREE_PINE) {
    if (dy > 1 || y <= tree.z + 2) {
      return BLOCK_AIR;
    }
    let level = 1 - dy;
    var radius = select(2, 1, level % 2 == 0);
    if (level == 0) {
      radius = 0;
    } else if (level == 1) {
      radius = 1;
    }
    var inside = dx <= radius && dz <= radius && !(radius == 2 && dx == 2 && dz == 2);
    if (level == 1) {
      inside = dx + dz <= 1;
    }
    return select(BLOCK_AIR, BLOCK_PINE_LEAVES, inside);
  }
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

fn plantAt(x: i32, y: i32, z: i32, biome: u32, seed: u32) -> u32 {
  if (biome != BIOME_PLAINS && biome != BIOME_FOREST) {
    return BLOCK_AIR;
  }
  let r = hash3(x, y, z, seed + 333u) % 1000u;
  let grass = select(100u, 160u, biome == BIOME_PLAINS);
  let flowers = select(15u, 40u, biome == BIOME_PLAINS);
  if (r < grass) {
    return BLOCK_TALL_GRASS;
  }
  if (r < grass + flowers) {
    return select(BLOCK_YELLOW_FLOWER, BLOCK_RED_FLOWER, (r & 1u) == 0u);
  }
  return BLOCK_AIR;
}

fn terrainBlock(x: i32, y: i32, z: i32, height: f32, biome: u32, tree: vec4<i32>, kind: u32, seed: u32) -> u32 {
  let density = terrainDensity(x, y, z, height, seed);
  if (density <= 0.0) {
    let t = treeBlock(x, y, z, tree, kind, seed);
    if (t != BLOCK_AIR) {
      return t;
    }
    if (y <= SEA_LEVEL) {
      return select(BLOCK_WATER, BLOCK_ICE, biome == BIOME_SNOWY && y == SEA_LEVEL);
    }
    if (f32(y - 1) <= height + DETAIL_AMPLITUDE + 1.0 && terrainDensity(x, y - 1, z, height, seed) > 0.0 &&
        surfaceBlock(y - 1, biome) == BLOCK_GRASS) {
      return plantAt(x, y, z, biome, seed);
    }
    return BLOCK_AIR;
  }
  if (y <= WORLD_MIN_Y + i32(hash3(x, 0, z, seed + 99u) % 3u)) {
    return BLOCK_BEDROCK;
  }
  if (isCave(x, y, z, density, seed)) {
    return BLOCK_AIR;
  }
  if (terrainDensity(x, y + 1, z, height, seed) <= 0.0) {
    return surfaceBlock(y, biome);
  }
  let shallow = terrainDensity(x, y + 4, z, height, seed) <= 0.0;
  let sandy = y <= BEACH_MAX_Y || biome == BIOME_DESERT;
  if (shallow) {
    if (sandy) {
      return BLOCK_SAND;
    }
    return select(BLOCK_DIRT, BLOCK_STONE, y > GRASS_MAX_Y);
  }
  if (biome == BIOME_DESERT && terrainDensity(x, y + 9, z, height, seed) <= 0.0) {
    return BLOCK_SANDSTONE;
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
  let word = wg.x * 64u + li; // 0 .. 8191: 4 voxels along X per word
  let origin = job.chunk * CHUNK_SIZE_I;
  let lz = word >> 8u; // constant across the workgroup (64 words never straddle a z slice)
  let wz = origin.z + i32(lz);

  if (li < 32u) {
    let col = column(f32(origin.x + i32(li)), f32(wz), params.seed);
    columnTarget[li] = col.target_height;
    columnBiome[li] = col.biome;
  } else if (li < 36u) {
    let cellX = origin.x / TREE_CELL + i32(li - 32u);
    let cellZ = i32(floor(f32(wz) / f32(TREE_CELL)));
    var kind = 0u;
    treeData[li - 32u] = treeInCell(cellX, cellZ, params.seed, &kind);
    treeKind[li - 32u] = kind;
  }
  workgroupBarrier();

  let ly = (word >> 3u) & 31u;
  let lx0 = (word & 7u) * 4u;
  let cell = lx0 / u32(TREE_CELL);
  let tree = treeData[cell];
  let kind = treeKind[cell];
  var packed = 0u;
  for (var k = 0u; k < 4u; k++) {
    let lx = lx0 + k;
    let block = terrainBlock(origin.x + i32(lx), origin.y + i32(ly), wz, columnTarget[lx], columnBiome[lx], tree, kind, params.seed);
    packed |= block << (k * 8u);
  }
  let base = job.slot * SLOT_WORDS;
  voxels[base + GPU_DATA_OFFSET + word] = packed;

  // Header: 8 bits per index, identity palette.
  if (word < GPU_DATA_OFFSET) {
    var value = 0u;
    if (word == 0u) {
      value = 8u;
    } else if (word == 1u) {
      value = MAX_GPU_PALETTE;
    } else if (word >= GPU_PALETTE_OFFSET) {
      value = word - GPU_PALETTE_OFFSET;
    }
    voxels[base + word] = value;
  }
}
