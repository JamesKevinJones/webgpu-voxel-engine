import { describe, expect, it } from 'vitest';
import { BlockType, isOpaque } from '../src/world/block';
import { CHUNK_SIZE, localIndex } from '../src/world/coords';
import { fbm2, hash3, ridged2, simplex2, simplex3, smoothstep } from '../src/world/noise';
import {
  BEACH_MAX_Y,
  CAVE_MAX_Y,
  CAVE_MIN_DENSITY,
  CAVE_MIN_Y,
  GRASS_MAX_Y,
  SEA_LEVEL,
  TREE_CELL,
  WORLD_MIN_Y,
  blockAt,
  generateChunkDense,
  isCave,
  surfaceHeight,
  targetHeight,
  terrainDensity,
  treeInCell,
} from '../src/world/terrain';
import { mulberry32 } from './helpers';

describe('hash3', () => {
  it('is a pure function of its inputs (golden values shared with noise.wgsl)', () => {
    // Reference values computed independently with arbitrary-precision u32 arithmetic.
    // If these change, the GPU and CPU terrain silently diverge: update noise.wgsl in lockstep.
    expect(hash3(0, 0, 0, 0)).toBe(0);
    expect(hash3(1, 2, 3, 1337)).toBe(hash3(1, 2, 3, 1337));
    expect([hash3(1, 0, 0, 0), hash3(0, 1, 0, 0), hash3(0, 0, 1, 0), hash3(-1, -1, -1, 1337)])
      .toEqual([139830557, 3365436886, 31716152, 3402996921]);
  });

  it('returns unsigned 32-bit values with well-mixed bits', () => {
    const bitCounts = new Array(32).fill(0);
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const h = hash3(i % 97, Math.floor(i / 97), -i, 42);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      for (let b = 0; b < 32; b++) bitCounts[b] += (h >>> b) & 1;
    }
    for (const c of bitCounts) expect(Math.abs(c / n - 0.5)).toBeLessThan(0.02);
  });

  it('decorrelates seeds and neighbouring lattice points', () => {
    expect(hash3(10, 20, 30, 1)).not.toBe(hash3(10, 20, 30, 2));
    expect(hash3(10, 20, 30, 1)).not.toBe(hash3(11, 20, 30, 1));
    expect(hash3(10, 20, 30, 1)).not.toBe(hash3(20, 10, 30, 1));
  });
});

describe('simplex noise', () => {
  it('is deterministic for a given seed', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const x = (rand() - 0.5) * 1000, y = (rand() - 0.5) * 1000, z = (rand() - 0.5) * 1000;
      expect(simplex3(x, y, z, 99)).toBe(simplex3(x, y, z, 99));
      expect(simplex2(x, y, 99)).toBe(simplex2(x, y, 99));
    }
  });

  it('depends on the seed', () => {
    let differ = 0;
    for (let i = 0; i < 100; i++) if (simplex3(i * 0.37, i * 0.11, -i * 0.23, 1) !== simplex3(i * 0.37, i * 0.11, -i * 0.23, 2)) differ++;
    expect(differ).toBeGreaterThan(95);
  });

  it('stays within [-1, 1] with a roughly zero mean', () => {
    const rand = mulberry32(5);
    let sum2 = 0, sum3 = 0, max = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const x = (rand() - 0.5) * 500, y = (rand() - 0.5) * 500, z = (rand() - 0.5) * 500;
      const a = simplex2(x, y, 3), b = simplex3(x, y, z, 3);
      sum2 += a;
      sum3 += b;
      max = Math.max(max, Math.abs(a), Math.abs(b));
    }
    expect(max).toBeLessThanOrEqual(1.05);
    expect(max).toBeGreaterThan(0.6); // actually uses its range
    expect(Math.abs(sum2 / n)).toBeLessThan(0.02);
    expect(Math.abs(sum3 / n)).toBeLessThan(0.02);
  });

  it('is continuous', () => {
    const rand = mulberry32(11);
    for (let i = 0; i < 1000; i++) {
      const x = rand() * 100, y = rand() * 100, z = rand() * 100;
      expect(Math.abs(simplex3(x, y, z, 7) - simplex3(x + 1e-4, y, z, 7))).toBeLessThan(0.01);
      expect(Math.abs(simplex2(x, y, 7) - simplex2(x, y + 1e-4, 7))).toBeLessThan(0.01);
    }
  });

  it('normalises fractal sums', () => {
    const rand = mulberry32(13);
    for (let i = 0; i < 2000; i++) {
      const x = rand() * 1000, y = rand() * 1000;
      const f = fbm2(x, y, 5, 1);
      const r = ridged2(x, y, 5, 1);
      expect(Math.abs(f)).toBeLessThanOrEqual(1.05);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('implements smoothstep like WGSL', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('terrain', () => {
  const seed = 1337;
  const columns = (n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [((i * 7919) % 3000) - 1500, ((i * 104729) % 3000) - 1500]);

  it('generates identical chunks for identical seeds and different ones otherwise', () => {
    const a = generateChunkDense(1, 0, -1, seed);
    const b = generateChunkDense(1, 0, -1, seed);
    const c = generateChunkDense(1, 0, -1, seed + 1);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('is seamless across chunk borders (pure function of world position)', () => {
    const left = generateChunkDense(-1, 0, 0, 5);
    const right = generateChunkDense(0, 0, 0, 5);
    for (let y = 0; y < CHUNK_SIZE; y += 3) {
      for (let z = 0; z < CHUNK_SIZE; z += 2) {
        expect(left[localIndex(31, y, z)]).toBe(blockAt(-1, y, z, 5));
        expect(right[localIndex(0, y, z)]).toBe(blockAt(0, y, z, 5));
      }
    }
  });

  it('has density strictly decreasing with height (no floating terrain)', () => {
    let minStep = Infinity;
    for (const [x, z] of columns(1500)) {
      const t = targetHeight(x, z, seed);
      for (let y = WORLD_MIN_Y; y < 110; y += 2) {
        minStep = Math.min(minStep, terrainDensity(x, y, z, t, seed) - terrainDensity(x, y + 1, z, t, seed));
      }
    }
    expect(minStep).toBeGreaterThan(0.1);
  });

  it('builds a solid column: nothing solid above the surface except trees', () => {
    for (const [x, z] of columns(150)) {
      const s = surfaceHeight(x, z, seed);
      for (let y = s + 1; y < s + 12; y++) {
        const b = blockAt(x, y, z, seed);
        expect([BlockType.Air, BlockType.Water, BlockType.Wood, BlockType.Leaves]).toContain(b);
        if (b === BlockType.Water) expect(y).toBeLessThanOrEqual(SEA_LEVEL);
      }
      expect(isOpaque(blockAt(x, s, z, seed))).toBe(true);
    }
  });

  it('decorates the surface: grass, 3 dirt, then stone; sand on beaches and sea floors', () => {
    let grassColumns = 0, sandColumns = 0;
    for (const [x, z] of columns(400)) {
      const s = surfaceHeight(x, z, seed);
      const top = blockAt(x, s, z, seed);
      if (s <= BEACH_MAX_Y) {
        expect(top).toBe(BlockType.Sand);
        sandColumns++;
      } else if (s <= GRASS_MAX_Y) {
        expect(top).toBe(BlockType.Grass);
        grassColumns++;
        for (const d of [1, 2, 3]) {
          const layer = s - d <= BEACH_MAX_Y ? BlockType.Sand : BlockType.Dirt;
          expect([layer, BlockType.Air]).toContain(blockAt(x, s - d, z, seed));
        }
        expect([BlockType.Stone, BlockType.Basalt, BlockType.Air]).toContain(blockAt(x, s - 5, z, seed));
      } else {
        expect(top).toBe(BlockType.Stone);
      }
    }
    expect(grassColumns).toBeGreaterThan(50);
    expect(sandColumns).toBeGreaterThan(50);
  });

  it('carves caves only inside their height band and well below the surface', () => {
    let caves = 0;
    for (const [x, z] of columns(60)) {
      const t = targetHeight(x, z, seed);
      for (let y = WORLD_MIN_Y; y < 60; y++) {
        const d = terrainDensity(x, y, z, t, seed);
        if (isCave(x, y, z, d, seed)) {
          caves++;
          expect(y).toBeGreaterThanOrEqual(CAVE_MIN_Y);
          expect(y).toBeLessThanOrEqual(CAVE_MAX_Y);
          expect(d).toBeGreaterThan(CAVE_MIN_DENSITY);
          expect(blockAt(x, y, z, seed)).toBe(BlockType.Air);
        }
      }
    }
    expect(caves).toBeGreaterThan(0);
  });

  it('lays bedrock at the bottom of the world', () => {
    for (const [x, z] of columns(100)) {
      expect(blockAt(x, WORLD_MIN_Y, z, seed)).toBe(BlockType.Bedrock);
      expect(blockAt(x, WORLD_MIN_Y + 3, z, seed)).not.toBe(BlockType.Bedrock);
    }
  });

  it('grows trees on grass, fully inside their cell', () => {
    let found = 0;
    for (let cx = -10; cx < 10; cx++) {
      for (let cz = -10; cz < 10; cz++) {
        const tree = treeInCell(cx, cz, seed);
        if (!tree) continue;
        found++;
        expect(Math.floor(tree.x / TREE_CELL)).toBe(cx);
        expect(tree.x - 2).toBeGreaterThanOrEqual(cx * TREE_CELL);
        expect(tree.x + 2).toBeLessThan((cx + 1) * TREE_CELL);
        expect(tree.z - 2).toBeGreaterThanOrEqual(cz * TREE_CELL);
        expect(tree.z + 2).toBeLessThan((cz + 1) * TREE_CELL);
        expect(blockAt(tree.x, tree.base, tree.z, seed)).toBe(BlockType.Grass);
        expect(blockAt(tree.x, tree.base + 1, tree.z, seed)).toBe(BlockType.Wood);
        expect(blockAt(tree.x, tree.top + 1, tree.z, seed)).toBe(BlockType.Leaves);
        expect(tree.top - tree.base).toBeGreaterThanOrEqual(4);
      }
    }
    expect(found).toBeGreaterThan(20);
  });

  it('produces varied terrain with every block type somewhere', () => {
    const seen = new Set<number>();
    for (const [cx, cy, cz] of [[0, 0, 0], [0, -1, 0], [0, -2, 0], [5, 0, 5], [-8, 1, 3], [12, 0, -12], [3, -1, 2], [-4, 0, 5], [6, 0, -3]]) {
      for (const v of generateChunkDense(cx!, cy!, cz!, seed)) seen.add(v);
    }
    for (const b of Object.values(BlockType)) expect(seen.has(b), `block ${b}`).toBe(true);
  });
});
