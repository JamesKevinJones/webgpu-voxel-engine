import { BlockType } from './block';
import { CHUNK_SIZE, CHUNK_VOLUME, localIndex } from './coords';
import { fbm2, hash3, ridged2, simplex3, smoothstep } from './noise';

/**
 * Terrain definition. `worldgen.wgsl` (+ `climate.wgsl`) implements exactly the same functions on
 * the GPU; this CPU mirror exists for unit tests, GPU/CPU parity checks, spawning and tooling.
 *
 * Pipeline per voxel:
 *  1. Climate: continentalness, temperature and humidity (low-frequency 2D noise) → smooth biome
 *     weights for plains, desert, snowy mountains and dense forest.
 *  2. Heightmap: continental spline + biome-weighted hills, dunes and ridged mountains (rounded
 *     crests, erosion-attenuated).
 *  3. Density = targetHeight − y + 3D detail whose amplitude fades with altitude. The detail's
 *     vertical gradient stays < 1, so density strictly decreases upwards: one surface per column,
 *     no floating slivers and no rock needles.
 *  4. Worm caves between Y = −40 and 20, only well below the surface.
 *  5. Biome decoration (grass/dirt, sand/sandstone, snow/ice, bare peaks), trees (oak, birch, pine,
 *     cactus) with clearance checks, and cross-plant foliage (tall grass, flowers).
 */
export const SEA_LEVEL = 0;
/** Vertical streaming range in chunk coordinates (inclusive). */
export const WORLD_MIN_CHUNK_Y = -2;
export const WORLD_MAX_CHUNK_Y = 3;
export const WORLD_MIN_Y = WORLD_MIN_CHUNK_Y * CHUNK_SIZE;
export const WORLD_MAX_Y = (WORLD_MAX_CHUNK_Y + 1) * CHUNK_SIZE - 1;

export const CAVE_MIN_Y = -40;
export const CAVE_MAX_Y = 20;
/** Caves are carved only where the terrain density exceeds this (≈ blocks below the surface). */
export const CAVE_MIN_DENSITY = 5;
/** Surfaces above this height are bare rock (outside snowy biomes). */
export const GRASS_MAX_Y = 62;
/** Snowy biome: surfaces above this are exposed stone peaks. */
export const PEAK_Y = 70;
/** Beaches: surface blocks at or below this height are sand. */
export const BEACH_MAX_Y = SEA_LEVEL + 2;
/** Trees: at most one per TREE_CELL × TREE_CELL cell, fully contained in the cell. */
export const TREE_CELL = 8;
/** Canopy radius; trunks are placed at least this far from the cell border. */
export const TREE_RADIUS = 2;
/** Amplitude of the 3D detail noise at low altitude; it fades out between DETAIL_FADE_START and _END. */
export const DETAIL_AMPLITUDE = 4;
export const DETAIL_FADE_START = 28;
export const DETAIL_FADE_END = 64;
/** The actual surface lies within this many blocks of floor(targetHeight). */
export const SURFACE_SEARCH = 6;

export const DEFAULT_SEED = 1337;

export const Biome = { Plains: 0, Desert: 1, SnowyMountains: 2, Forest: 3 } as const;
export type Biome = (typeof Biome)[keyof typeof Biome];
export const BIOME_NAMES = ['Plains', 'Desert', 'Snowy Mountains', 'Dense Forest'] as const;

export const TreeKind = { Oak: 0, Birch: 1, Pine: 2, Cactus: 3 } as const;
export type TreeKind = (typeof TreeKind)[keyof typeof TreeKind];

// ------------------------------------------------------------------------------------ climate

export interface Climate {
  continental: number;
  temperature: number;
  humidity: number;
  /** Smooth biome weights (non-negative, sum to 1), indexed by Biome. */
  weights: [number, number, number, number];
  biome: Biome;
}

export function temperatureAt(x: number, z: number, seed: number): number {
  return fbm2(x * 0.0011, z * 0.0011, 3, (seed + 501) >>> 0);
}

export function humidityAt(x: number, z: number, seed: number): number {
  return fbm2(x * 0.0013, z * 0.0013, 3, (seed + 502) >>> 0);
}

/** Smooth biome weights from temperature and humidity (Plains, Desert, Snowy, Forest). */
export function biomeWeights(temperature: number, humidity: number): [number, number, number, number] {
  const cold = 1 - smoothstep(-0.28, -0.12, temperature);
  const hot = smoothstep(0.1, 0.26, temperature);
  const dry = 1 - smoothstep(-0.08, 0.06, humidity);
  const wet = smoothstep(0.06, 0.2, humidity);
  const desert = hot * dry * (1 - cold);
  const snowy = cold;
  const forest = (1 - cold) * (1 - desert) * wet;
  const plains = Math.max(0, 1 - desert - snowy - forest);
  return [plains, desert, snowy, forest];
}

/** Index of the largest weight (ties resolve to the lower biome id). */
export function dominantBiome(w: readonly number[]): Biome {
  let best: Biome = Biome.Plains;
  let bestWeight = w[0]!;
  if (w[1]! > bestWeight) { best = 1; bestWeight = w[1]!; }
  if (w[2]! > bestWeight) { best = 2; bestWeight = w[2]!; }
  if (w[3]! > bestWeight) best = 3;
  return best;
}

export function climateAt(x: number, z: number, seed: number): Climate {
  const temperature = temperatureAt(x, z, seed);
  const humidity = humidityAt(x, z, seed);
  const weights = biomeWeights(temperature, humidity);
  return { continental: fbm2(x * 0.0022, z * 0.0022, 5, seed), temperature, humidity, weights, biome: dominantBiome(weights) };
}

/**
 * Procedural grass/foliage tint palette: bilinear lookup over (temperature, humidity) corners,
 * darkened in dense forests. Mirrors `grassTint` in climate.wgsl. Returns linear RGB.
 */
export function grassTint(temperature: number, humidity: number): [number, number, number] {
  const t = Math.min(Math.max(temperature * 1.6 + 0.5, 0), 1);
  const h = Math.min(Math.max(humidity * 1.6 + 0.5, 0), 1);
  const cold = mix3([0.46, 0.6, 0.42], [0.3, 0.5, 0.36], h);
  const hot = mix3([0.72, 0.66, 0.3], [0.28, 0.62, 0.14], h);
  const forest = biomeWeights(temperature, humidity)[Biome.Forest];
  const c = mix3(cold, hot, t);
  const shade = 1 - 0.3 * forest;
  return [c[0] * shade, c[1] * shade, c[2] * shade];
}

type Rgb = [number, number, number];

function mix3(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ------------------------------------------------------------------------------------ height

// Continentalness → base height (piecewise linear).
const SPLINE_C = [-1.0, -0.4, -0.15, -0.04, 0.1, 0.35, 0.6, 1.0];
const SPLINE_H = [-38, -22, -6, 1, 5, 12, 20, 28];

export function continentalHeight(c: number): number {
  let h = SPLINE_H[0]!;
  for (let i = 0; i < 7; i++) {
    const c0 = SPLINE_C[i]!, c1 = SPLINE_C[i + 1]!;
    if (c >= c0) h = SPLINE_H[i]! + (SPLINE_H[i + 1]! - SPLINE_H[i]!) * Math.min((c - c0) / (c1 - c0), 1);
  }
  return h;
}

/** Continuous target surface height of column (x, z). */
export function targetHeight(x: number, z: number, seed: number, climate: Climate = climateAt(x, z, seed)): number {
  const c = climate.continental;
  const w = climate.weights;
  const erosion = fbm2(x * 0.0045, z * 0.0045, 3, (seed + 11) >>> 0) * 0.5 + 0.5;
  const roughness = 1 - smoothstep(0.4, 0.75, erosion);
  const land = smoothstep(-0.12, 0.08, c);
  const hillAmp = w[0] * 7 + w[1] * 4 + w[2] * 12 + w[3] * 10;
  const hills = fbm2(x * 0.013, z * 0.013, 4, (seed + 22) >>> 0) * hillAmp * (0.3 + 0.7 * roughness) * (0.35 + 0.65 * land);
  const ridge = ridged2(x * 0.0048, z * 0.0048, 4, (seed + 33) >>> 0);
  const mountainAmp = 64 * (0.75 + 0.6 * w[2] - 0.45 * w[1]);
  const mountains = ridge * ridge * mountainAmp * smoothstep(0.18, 0.5, c) * roughness;
  const dunes = ridged2(x * 0.018, z * 0.03, 2, (seed + 44) >>> 0) * 6 * w[1] * land;
  return continentalHeight(c) + hills + mountains + dunes;
}

/** 3D detail amplitude at height y: full near sea level, faded on high peaks (no rock needles). */
export function detailAmplitude(y: number): number {
  return DETAIL_AMPLITUDE * (1 - 0.75 * smoothstep(DETAIL_FADE_START, DETAIL_FADE_END, y));
}

/** Terrain density: positive = solid. Strictly decreasing in y for a fixed column. */
export function terrainDensity(x: number, y: number, z: number, target: number, seed: number): number {
  return target - y + simplex3(x * 0.03, y * 0.03, z * 0.03, (seed + 45) >>> 0) * detailAmplitude(y);
}

/** Worm caves: two ridged multifractal fields whose ridges intersect along tubes. */
export function isCave(x: number, y: number, z: number, density: number, seed: number): boolean {
  if (y < CAVE_MIN_Y || y > CAVE_MAX_Y || density <= CAVE_MIN_DENSITY) return false;
  const fade = smoothstep(-40, -34, y) * (1 - smoothstep(14, 20, y));
  const px = x * 0.022, py = y * 0.034, pz = z * 0.022;
  const w1 = simplex3(px, py, pz, (seed + 55) >>> 0) + 0.5 * simplex3(px * 2, py * 2, pz * 2, (seed + 56) >>> 0);
  const w2 = simplex3(px, py, pz, (seed + 66) >>> 0) + 0.5 * simplex3(px * 2, py * 2, pz * 2, (seed + 67) >>> 0);
  const ridge1 = 1 - Math.abs(w1);
  const ridge2 = 1 - Math.abs(w2);
  const threshold = 1 - 0.11 * fade;
  return ridge1 > threshold && ridge2 > threshold;
}

/** Topmost solid voxel (ignoring caves) of column (x, z). */
export function columnSurface(x: number, z: number, target: number, seed: number): number {
  const base = Math.floor(target);
  for (let y = base + SURFACE_SEARCH; y >= base - SURFACE_SEARCH; y--) {
    if (terrainDensity(x, y, z, target, seed) > 0) return y;
  }
  return base - SURFACE_SEARCH - 1;
}

export function surfaceHeight(x: number, z: number, seed: number): number {
  return columnSurface(x, z, targetHeight(x, z, seed), seed);
}

/** Block placed on top of a column whose surface is at `y` (before caves and trees). */
export function surfaceBlock(y: number, biome: Biome): number {
  if (biome === Biome.SnowyMountains) return y > PEAK_Y ? BlockType.Stone : BlockType.Snow;
  if (y <= BEACH_MAX_Y || biome === Biome.Desert) return BlockType.Sand;
  if (y > GRASS_MAX_Y) return BlockType.Stone;
  return BlockType.Grass;
}

// ------------------------------------------------------------------------------------ trees

export interface Tree {
  kind: TreeKind;
  x: number;
  z: number;
  /** Surface block the trunk stands on. */
  base: number;
  /** Topmost trunk block. */
  top: number;
}

/** Chance (out of 256) that a cell of each biome grows a tree/cactus. */
const TREE_CHANCE = [26, 46, 90, 218] as const;

/**
 * Tree of cell (cellX, cellZ), or null. Trees grow only on the biome's natural surface block
 * (grass, snow for pines, desert sand for cacti), with sky clearance up to the world top and no
 * neighbouring column (at canopy radius) rising above the trunk base + 2.
 */
export function treeInCell(cellX: number, cellZ: number, seed: number): Tree | null {
  const h = hash3(cellX, 1, cellZ, (seed + 77) >>> 0);
  const x = cellX * TREE_CELL + TREE_RADIUS + (h & 3);
  const z = cellZ * TREE_CELL + TREE_RADIUS + ((h >>> 2) & 3);
  const climate = climateAt(x, z, seed);
  const biome = climate.biome;
  if (((h >>> 4) & 255) >= TREE_CHANCE[biome]) return null;
  const base = columnSurface(x, z, targetHeight(x, z, seed, climate), seed);
  const ground = surfaceBlock(base, biome);
  let kind: TreeKind;
  if (biome === Biome.Desert) {
    if (ground !== BlockType.Sand || base <= BEACH_MAX_Y) return null;
    kind = TreeKind.Cactus;
  } else if (biome === Biome.SnowyMountains) {
    if (ground !== BlockType.Snow || base <= BEACH_MAX_Y) return null;
    kind = TreeKind.Pine;
  } else {
    if (ground !== BlockType.Grass) return null;
    kind = biome === Biome.Forest && ((h >>> 20) & 1) === 1 ? TreeKind.Birch : TreeKind.Oak;
  }
  const heights = [4, 5, 6, 2];
  const variation = kind === TreeKind.Pine ? 4 : 3;
  const top = base + heights[kind]! + ((h >>> 12) % variation);
  if (top + 3 > WORLD_MAX_Y) return null;
  // Clearance: no cliff face may cut through the canopy.
  const offsets = [[TREE_RADIUS, 0], [-TREE_RADIUS, 0], [0, TREE_RADIUS], [0, -TREE_RADIUS]] as const;
  for (let i = 0; i < 4; i++) {
    if (surfaceHeight(x + offsets[i]![0], z + offsets[i]![1], seed) > base + 2) return null;
  }
  return { kind, x, z, base, top };
}

const TRUNK = [BlockType.Wood, BlockType.BirchWood, BlockType.PineWood, BlockType.Cactus] as const;

/** Trunk / leaf / cactus block of `tree` at (x, y, z), or Air. Canopies stay inside the cell. */
export function treeBlock(x: number, y: number, z: number, tree: Tree | null, seed: number): number {
  if (!tree) return BlockType.Air;
  const dx = Math.abs(x - tree.x), dz = Math.abs(z - tree.z);
  if (dx === 0 && dz === 0 && y > tree.base && y <= tree.top) return TRUNK[tree.kind];
  const dy = y - tree.top;
  if (tree.kind === TreeKind.Cactus) return BlockType.Air;
  if (tree.kind === TreeKind.Pine) {
    // Cone of needles: radius per level below the tip, alternating to form tiers.
    if (dy > 1 || y <= tree.base + 2) return BlockType.Air;
    const level = 1 - dy; // 0 at the tip
    const radius = level === 0 ? 0 : level === 1 ? 1 : level % 2 === 0 ? 1 : 2;
    const plus = level === 1;
    const inside = plus ? dx + dz <= 1 : dx <= radius && dz <= radius && !(radius === 2 && dx === 2 && dz === 2);
    return inside ? BlockType.PineLeaves : BlockType.Air;
  }
  if (dy >= -2 && dy <= -1 && dx <= 2 && dz <= 2) {
    const corner = dx === 2 && dz === 2;
    if (!corner || (hash3(x, y, z, (seed + 88) >>> 0) & 1) === 0) return BlockType.Leaves;
  }
  if (dy >= 0 && dy <= 1 && dx <= 1 && dz <= 1 && !(dy === 1 && dx === 1 && dz === 1)) return BlockType.Leaves;
  return BlockType.Air;
}

// ------------------------------------------------------------------------------------ blocks

/** Cross plant (tall grass / flower) growing at (x, y, z) on a grass block of `biome`, or Air. */
export function plantAt(x: number, y: number, z: number, biome: Biome, seed: number): number {
  if (biome !== Biome.Plains && biome !== Biome.Forest) return BlockType.Air;
  const r = hash3(x, y, z, (seed + 333) >>> 0) % 1000;
  const grass = biome === Biome.Plains ? 160 : 100;
  const flowers = biome === Biome.Plains ? 40 : 15;
  if (r < grass) return BlockType.TallGrass;
  if (r < grass + flowers) return (r & 1) === 0 ? BlockType.RedFlower : BlockType.YellowFlower;
  return BlockType.Air;
}

/**
 * Block at world voxel (x, y, z) given the column's target height and biome, and the cell's tree.
 */
export function terrainBlock(
  x: number, y: number, z: number, target: number, biome: Biome, tree: Tree | null, seed: number,
): number {
  const density = terrainDensity(x, y, z, target, seed);
  if (density <= 0) {
    const t = treeBlock(x, y, z, tree, seed);
    if (t !== BlockType.Air) return t;
    if (y <= SEA_LEVEL) return biome === Biome.SnowyMountains && y === SEA_LEVEL ? BlockType.Ice : BlockType.Water;
    // Plants grow on grass: the block below must be the surface and itself grass.
    if (y - 1 <= target + DETAIL_AMPLITUDE + 1 && terrainDensity(x, y - 1, z, target, seed) > 0 &&
        surfaceBlock(y - 1, biome) === BlockType.Grass) {
      return plantAt(x, y, z, biome, seed);
    }
    return BlockType.Air;
  }
  if (y <= WORLD_MIN_Y + (hash3(x, 0, z, (seed + 99) >>> 0) % 3)) return BlockType.Bedrock;
  if (isCave(x, y, z, density, seed)) return BlockType.Air;
  const top = terrainDensity(x, y + 1, z, target, seed) <= 0;
  if (top) return surfaceBlock(y, biome);
  const shallow = terrainDensity(x, y + 4, z, target, seed) <= 0;
  const sandy = y <= BEACH_MAX_Y || biome === Biome.Desert;
  if (shallow) {
    if (sandy) return BlockType.Sand;
    return y > GRASS_MAX_Y ? BlockType.Stone : BlockType.Dirt;
  }
  // Deserts: a sandstone band under the sand.
  if (biome === Biome.Desert && terrainDensity(x, y + 9, z, target, seed) <= 0) return BlockType.Sandstone;
  if (y < -44 + simplex3(x * 0.04, y * 0.04, z * 0.04, (seed + 111) >>> 0) * 4) return BlockType.Basalt;
  return BlockType.Stone;
}

/** Block at a single world voxel (convenience; recomputes the column and tree). */
export function blockAt(x: number, y: number, z: number, seed: number): number {
  const tree = treeInCell(Math.floor(x / TREE_CELL), Math.floor(z / TREE_CELL), seed);
  const climate = climateAt(x, z, seed);
  return terrainBlock(x, y, z, targetHeight(x, z, seed, climate), climate.biome, tree, seed);
}

/** Generates a dense chunk (block id per voxel, x fastest). */
export function generateChunkDense(
  cx: number,
  cy: number,
  cz: number,
  seed: number,
  out: Uint16Array = new Uint16Array(CHUNK_VOLUME),
): Uint16Array {
  const ox = cx * CHUNK_SIZE, oy = cy * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
  const cellsPerChunk = CHUNK_SIZE / TREE_CELL;
  const trees: (Tree | null)[] = [];
  for (let tz = 0; tz < cellsPerChunk; tz++) {
    for (let tx = 0; tx < cellsPerChunk; tx++) {
      trees.push(treeInCell(ox / TREE_CELL + tx, oz / TREE_CELL + tz, seed));
    }
  }
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const climate = climateAt(ox + lx, oz + lz, seed);
      const target = targetHeight(ox + lx, oz + lz, seed, climate);
      const tree = trees[Math.floor(lz / TREE_CELL) * cellsPerChunk + Math.floor(lx / TREE_CELL)]!;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        out[localIndex(lx, ly, lz)] = terrainBlock(ox + lx, oy + ly, oz + lz, target, climate.biome, tree, seed);
      }
    }
  }
  return out;
}
