import { BlockType } from './block';
import { CHUNK_SIZE, CHUNK_VOLUME, localIndex } from './coords';
import { fbm2, hash3, ridged2, simplex3, smoothstep } from './noise';

/**
 * Terrain definition. `worldgen.wgsl` implements exactly the same functions on the GPU; this CPU
 * mirror exists for unit tests, GPU/CPU parity checks, spawning and tooling.
 *
 * Pipeline per voxel:
 *  1. 2D heightmap: continentalness → piecewise-linear base height (ocean shelf, beaches, plains,
 *     highlands), plus hills and ridged mountains attenuated by an erosion field.
 *  2. Density = targetHeight − y + small 3D detail. The detail term's vertical gradient is < 1, so
 *     density strictly decreases upwards: every column has a single surface and no floating islands.
 *  3. Worm caves: intersection of two ridged 3D fields, only for Y in [-40, 20] and only well below
 *     the surface (density > CAVE_MIN_DENSITY), so caves never shred the surface.
 *  4. Decoration: grass on top, 3 blocks of dirt, stone below; sand on beaches and sea floors;
 *     basalt deep down, bedrock at the bottom; trees on grass.
 */
export const SEA_LEVEL = 0;
/** Vertical streaming range in chunk coordinates (inclusive). */
export const WORLD_MIN_CHUNK_Y = -2;
export const WORLD_MAX_CHUNK_Y = 3;
export const WORLD_MIN_Y = WORLD_MIN_CHUNK_Y * CHUNK_SIZE;

export const CAVE_MIN_Y = -40;
export const CAVE_MAX_Y = 20;
/** Caves are carved only where the terrain density exceeds this (≈ blocks below the surface). */
export const CAVE_MIN_DENSITY = 5;
/** Surfaces above this height are bare rock. */
export const GRASS_MAX_Y = 62;
/** Beaches: surface blocks at or below this height are sand. */
export const BEACH_MAX_Y = SEA_LEVEL + 2;
/** Trees: at most one per TREE_CELL × TREE_CELL cell, fully contained in the cell. */
export const TREE_CELL = 8;
/** Amplitude of the 3D detail noise added to the heightmap density. */
export const DETAIL_AMPLITUDE = 4;
/** The actual surface lies within this many blocks of floor(targetHeight). */
export const SURFACE_SEARCH = 6;

export const DEFAULT_SEED = 1337;

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
export function targetHeight(x: number, z: number, seed: number): number {
  const c = fbm2(x * 0.0022, z * 0.0022, 5, seed);
  const erosion = fbm2(x * 0.0045, z * 0.0045, 3, (seed + 11) >>> 0) * 0.5 + 0.5;
  const roughness = 1 - smoothstep(0.4, 0.75, erosion);
  const land = smoothstep(-0.12, 0.08, c);
  const hills = fbm2(x * 0.013, z * 0.013, 4, (seed + 22) >>> 0) * 11 * (0.25 + 0.75 * roughness) * (0.35 + 0.65 * land);
  const ridge = ridged2(x * 0.0048, z * 0.0048, 5, (seed + 33) >>> 0);
  const mountains = ridge * ridge * 64 * smoothstep(0.18, 0.5, c) * roughness;
  return continentalHeight(c) + hills + mountains;
}

/** Terrain density: positive = solid. Strictly decreasing in y for a fixed column. */
export function terrainDensity(x: number, y: number, z: number, target: number, seed: number): number {
  return target - y + simplex3(x * 0.03, y * 0.03, z * 0.03, (seed + 44) >>> 0) * DETAIL_AMPLITUDE;
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

export interface Tree {
  x: number;
  z: number;
  /** Surface (grass) block the trunk stands on. */
  base: number;
  /** Topmost trunk block. */
  top: number;
}

/** Tree of the cell containing world column cell (cellX, cellZ), or null. */
export function treeInCell(cellX: number, cellZ: number, seed: number): Tree | null {
  const h = hash3(cellX, 1, cellZ, (seed + 77) >>> 0);
  if (((h >>> 4) & 255) >= 90) return null;
  const x = cellX * TREE_CELL + 2 + (h & 3);
  const z = cellZ * TREE_CELL + 2 + ((h >>> 2) & 3);
  const base = columnSurface(x, z, targetHeight(x, z, seed), seed);
  if (base <= BEACH_MAX_Y || base > GRASS_MAX_Y) return null;
  return { x, z, base, top: base + 4 + ((h >>> 12) % 3) };
}

/** Wood / leaves block of `tree` at (x, y, z), or Air. Canopy radius 2 keeps trees inside their cell. */
export function treeBlock(x: number, y: number, z: number, tree: Tree | null, seed: number): number {
  if (!tree) return BlockType.Air;
  const dx = Math.abs(x - tree.x), dz = Math.abs(z - tree.z);
  if (dx === 0 && dz === 0 && y > tree.base && y <= tree.top) return BlockType.Wood;
  const dy = y - tree.top;
  if (dy >= -2 && dy <= -1 && dx <= 2 && dz <= 2) {
    const corner = dx === 2 && dz === 2;
    if (!corner || (hash3(x, y, z, (seed + 88) >>> 0) & 1) === 0) return BlockType.Leaves;
  }
  if (dy >= 0 && dy <= 1 && dx <= 1 && dz <= 1 && !(dy === 1 && dx === 1 && dz === 1)) return BlockType.Leaves;
  return BlockType.Air;
}

/** Block at world voxel (x, y, z) given the column's target height and the cell's tree. */
export function terrainBlock(x: number, y: number, z: number, target: number, tree: Tree | null, seed: number): number {
  const density = terrainDensity(x, y, z, target, seed);
  if (density <= 0) {
    const t = treeBlock(x, y, z, tree, seed);
    if (t !== BlockType.Air) return t;
    return y <= SEA_LEVEL ? BlockType.Water : BlockType.Air;
  }
  if (y <= WORLD_MIN_Y + (hash3(x, 0, z, (seed + 99) >>> 0) % 3)) return BlockType.Bedrock;
  if (isCave(x, y, z, density, seed)) return BlockType.Air;
  const top = terrainDensity(x, y + 1, z, target, seed) <= 0;
  const shallow = terrainDensity(x, y + 4, z, target, seed) <= 0;
  if (top || shallow) {
    if (y <= BEACH_MAX_Y) return BlockType.Sand;
    if (y > GRASS_MAX_Y) return BlockType.Stone;
    return top ? BlockType.Grass : BlockType.Dirt;
  }
  if (y < -44 + simplex3(x * 0.04, y * 0.04, z * 0.04, (seed + 111) >>> 0) * 4) return BlockType.Basalt;
  return BlockType.Stone;
}

/** Block at a single world voxel (convenience; recomputes the column and tree). */
export function blockAt(x: number, y: number, z: number, seed: number): number {
  const tree = treeInCell(Math.floor(x / TREE_CELL), Math.floor(z / TREE_CELL), seed);
  return terrainBlock(x, y, z, targetHeight(x, z, seed), tree, seed);
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
      const target = targetHeight(ox + lx, oz + lz, seed);
      const tree = trees[Math.floor(lz / TREE_CELL) * cellsPerChunk + Math.floor(lx / TREE_CELL)]!;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        out[localIndex(lx, ly, lz)] = terrainBlock(ox + lx, oy + ly, oz + lz, target, tree, seed);
      }
    }
  }
  return out;
}
