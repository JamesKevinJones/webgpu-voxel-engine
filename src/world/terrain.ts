import { BlockType } from './block';
import { CHUNK_SIZE, CHUNK_VOLUME, localIndex } from './coords';
import { fbm2, ridged2, simplex3, smoothstep } from './noise';

/**
 * Terrain definition. `worldgen.wgsl` implements exactly the same function on the GPU; this
 * CPU mirror exists for unit tests, GPU/CPU parity checks and tooling.
 */
export const SEA_LEVEL = 12;
/** Vertical streaming range in chunk coordinates (inclusive). */
export const WORLD_MIN_CHUNK_Y = -2;
export const WORLD_MAX_CHUNK_Y = 3;
export const WORLD_MIN_Y = WORLD_MIN_CHUNK_Y * CHUNK_SIZE;

export const DEFAULT_SEED = 1337;

/** Continuous terrain surface height at world column (x, z). */
export function terrainHeight(x: number, z: number, seed: number): number {
  const continental = fbm2(x * 0.0035, z * 0.0035, 4, seed);
  const hills = fbm2(x * 0.013, z * 0.013, 4, (seed + 101) >>> 0) * 9;
  const ridge = ridged2(x * 0.0065, z * 0.0065, 5, (seed + 202) >>> 0);
  const mountainMask = smoothstep(0.05, 0.45, continental);
  return 8 + continental * 26 + hills + ridge * ridge * 62 * mountainMask;
}

/** Integer surface height: the topmost solid voxel of the column (before caves). */
export function surfaceHeight(x: number, z: number, seed: number): number {
  return Math.floor(terrainHeight(x, z, seed));
}

/** Block at world voxel (x, y, z) given the column's integer surface height. */
export function terrainBlock(x: number, y: number, z: number, surface: number, seed: number): number {
  if (y > surface) return y <= SEA_LEVEL ? BlockType.Water : BlockType.Air;
  const depth = surface - y;
  if (y < surface - 4 && y > WORLD_MIN_Y + 2) {
    const n1 = simplex3(x * 0.028, y * 0.042, z * 0.028, (seed + 303) >>> 0);
    const n2 = simplex3(x * 0.028, y * 0.042, z * 0.028, (seed + 404) >>> 0);
    if (n1 * n1 + n2 * n2 < 0.01) return BlockType.Air;
  }
  const beach = surface <= SEA_LEVEL + 1;
  const rocky = surface > 64;
  if (depth === 0) return beach ? BlockType.Sand : rocky ? BlockType.Stone : BlockType.Grass;
  if (depth < 4) return beach ? BlockType.Sand : rocky ? BlockType.Stone : BlockType.Dirt;
  if (y < -34 + simplex3(x * 0.04, y * 0.04, z * 0.04, (seed + 505) >>> 0) * 6) return BlockType.Basalt;
  return BlockType.Stone;
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
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const surface = surfaceHeight(ox + lx, oz + lz, seed);
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        out[localIndex(lx, ly, lz)] = terrainBlock(ox + lx, oy + ly, oz + lz, surface, seed);
      }
    }
  }
  return out;
}
