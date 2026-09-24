import { describe, expect, it } from 'vitest';
import {
  MAX_BURST,
  MAX_PARTICLES,
  MIN_BURST,
  PARTICLE_FLOATS,
  PARTICLE_GRAVITY,
  PARTICLE_RESTITUTION,
  ParticleRing,
  stepParticle,
} from '../src/fx/particles';
import { BlockType } from '../src/world/block';
import { mulberry32 } from './helpers';

function particle(values: Partial<{ pos: number[]; life: number; vel: number[]; size: number; floor: number }>): Float32Array {
  const p = new Float32Array(PARTICLE_FLOATS);
  p.set(values.pos ?? [0, 5, 0], 0);
  p[3] = values.life ?? 2;
  p.set(values.vel ?? [0, 0, 0], 4);
  p[7] = values.size ?? 0.2;
  p[8] = values.floor ?? 0;
  p[11] = values.life ?? 2;
  return p;
}

describe('particle bursts', () => {
  it('spawns 16–24 fragments of the broken block inside its voxel', () => {
    const ring = new ParticleRing(mulberry32(1));
    for (let trial = 0; trial < 20; trial++) {
      const ranges = ring.spawnBurst(BlockType.Stone, 10, 20, -5, 19);
      const count = ranges.reduce((n, r) => n + r.count, 0);
      expect(count).toBeGreaterThanOrEqual(MIN_BURST);
      expect(count).toBeLessThanOrEqual(MAX_BURST);
      for (const r of ranges) {
        for (let i = r.first; i < r.first + r.count; i++) {
          const o = i * PARTICLE_FLOATS, d = ring.data;
          expect(d[o]).toBeGreaterThanOrEqual(10);
          expect(d[o]).toBeLessThanOrEqual(11);
          expect(d[o + 1]).toBeGreaterThanOrEqual(20);
          expect(d[o + 2]).toBeLessThanOrEqual(-4);
          expect(d[o + 3]).toBeGreaterThan(0); // alive
          expect(d[o + 5]).toBeGreaterThan(0); // bursts upwards
          expect(d[o + 8]).toBe(19); // floor
          expect(d[o + 9]).toBe(BlockType.Stone);
        }
      }
    }
  });

  it('wraps around the ring buffer, reporting both dirty ranges', () => {
    const ring = new ParticleRing(mulberry32(2));
    let total = 0;
    let sawWrap = false;
    while (total < MAX_PARTICLES * 2) {
      const ranges = ring.spawnBurst(BlockType.Dirt, 0, 0, 0, 0);
      for (const r of ranges) {
        expect(r.first).toBeGreaterThanOrEqual(0);
        expect(r.first + r.count).toBeLessThanOrEqual(MAX_PARTICLES);
      }
      if (ranges.length === 2) {
        sawWrap = true;
        expect(ranges[0]!.first + ranges[0]!.count).toBe(MAX_PARTICLES);
        expect(ranges[1]!.first).toBe(0);
      }
      total += ranges.reduce((n, r) => n + r.count, 0);
    }
    expect(sawWrap).toBe(true);
    expect(ring.alive()).toBe(MAX_PARTICLES);
  });
});

describe('particle simulation (CPU mirror of particles.wgsl)', () => {
  it('applies gravity and velocity', () => {
    const p = particle({ pos: [0, 10, 0], vel: [1, 0, -2] });
    stepParticle(p, 0, 0.1, PARTICLE_GRAVITY);
    expect(p[5]).toBeCloseTo(-PARTICLE_GRAVITY * 0.1);
    expect(p[0]).toBeCloseTo(0.1);
    expect(p[2]).toBeCloseTo(-0.2);
    expect(p[1]).toBeCloseTo(10 - PARTICLE_GRAVITY * 0.01);
    expect(p[3]).toBeCloseTo(1.9);
  });

  it('rebounds off the floor with restitution and friction, never sinking below it', () => {
    const p = particle({ pos: [0, 0.2, 0], vel: [2, -5, 0], size: 0.2, floor: 0 });
    stepParticle(p, 0, 0.05, PARTICLE_GRAVITY);
    expect(p[1]).toBeCloseTo(0.1); // resting on the floor (half the size above it)
    expect(p[5]).toBeGreaterThan(0); // bounced
    expect(p[5]).toBeCloseTo((5 + PARTICLE_GRAVITY * 0.05) * PARTICLE_RESTITUTION, 4);
    expect(p[4]).toBeLessThan(2);
    for (let i = 0; i < 400; i++) {
      stepParticle(p, 0, 1 / 120, PARTICLE_GRAVITY);
      if (p[3]! > 0) expect(p[1]! - p[7]! / 2).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('settles and dies after its lifetime; dead particles are left untouched', () => {
    const ring = new ParticleRing(mulberry32(3));
    ring.spawnBurst(BlockType.Sand, 0, 5, 0, 5);
    for (let i = 0; i < 60; i++) ring.step(1 / 30);
    expect(ring.alive()).toBe(0);
    const dead = particle({ life: 0, pos: [1, 2, 3] });
    stepParticle(dead, 0, 0.1, PARTICLE_GRAVITY);
    expect([dead[0], dead[1], dead[2]]).toEqual([1, 2, 3]);
  });
});
