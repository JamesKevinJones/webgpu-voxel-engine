import { describe, expect, it } from 'vitest';
import { fbm2, hash3, ridged2, simplex2, simplex3, smoothstep } from '../src/world/noise';
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

