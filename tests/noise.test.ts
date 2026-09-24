import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/block';
import { CHUNK_SIZE, localIndex } from '../src/world/coords';
import { fbm2, hash3, ridged2, simplex2, simplex3, smoothstep } from '../src/world/noise';
import { SEA_LEVEL, generateChunkDense, surfaceHeight, terrainBlock, terrainHeight } from '../src/world/terrain';
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
  it('generates identical chunks for identical seeds and different ones otherwise', () => {
    const a = generateChunkDense(1, 0, -1, 1337);
    const b = generateChunkDense(1, 0, -1, 1337);
    const c = generateChunkDense(1, 0, -1, 1338);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('is seamless across chunk borders (pure function of world position)', () => {
    const left = generateChunkDense(-1, 0, 0, 5);
    const right = generateChunkDense(0, 0, 0, 5);
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        expect(left[localIndex(31, y, z)]).toBe(terrainBlock(-1, y, z, surfaceHeight(-1, z, 5), 5));
        expect(right[localIndex(0, y, z)]).toBe(terrainBlock(0, y, z, surfaceHeight(0, z, 5), 5));
      }
    }
  });

  it('places water, surface layers and sky consistently', () => {
    const seed = 1337;
    for (let x = -200; x <= 200; x += 13) {
      for (let z = -200; z <= 200; z += 17) {
        const h = surfaceHeight(x, z, seed);
        expect(h).toBe(Math.floor(terrainHeight(x, z, seed)));
        const above = terrainBlock(x, h + 1, z, h, seed);
        expect(above).toBe(h + 1 <= SEA_LEVEL ? BlockType.Water : BlockType.Air);
        expect(terrainBlock(x, Math.max(h, SEA_LEVEL) + 1, z, h, seed)).toBe(BlockType.Air);
        const top = terrainBlock(x, h, z, h, seed);
        expect([BlockType.Grass, BlockType.Sand, BlockType.Stone]).toContain(top);
        if (h <= SEA_LEVEL + 1) expect(top).toBe(BlockType.Sand);
      }
    }
  });

  it('produces varied terrain with every block type somewhere', () => {
    const seen = new Set<number>();
    for (const [cx, cy, cz] of [[0, 0, 0], [0, -1, 0], [0, -2, 0], [5, 0, 5], [-8, 1, 3], [12, 0, -12], [20, 1, 20], [-15, 0, -9]]) {
      for (const v of generateChunkDense(cx!, cy!, cz!, 1337)) seen.add(v);
    }
    for (const b of Object.values(BlockType)) expect(seen.has(b)).toBe(true);
  });
});
