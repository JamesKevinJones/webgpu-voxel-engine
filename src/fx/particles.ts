/**
 * Block-break debris particles. The simulation runs on the GPU (`particles.wgsl`, one invocation
 * per particle); this module owns the buffer layout, spawning (CPU writes new particles into a
 * ring buffer) and a reference implementation of the per-particle update used by the unit tests.
 *
 * Layout per particle (12 floats, three vec4s):
 *   [0..2] position (centre)   [3]  remaining life (s, ≤ 0 = dead)
 *   [4..6] velocity            [7]  edge size (m)
 *   [8]    floor height        [9]  block id   [10] texture offset seed (0..1)   [11] total life
 */
export const PARTICLE_FLOATS = 12;
export const PARTICLE_BYTES = PARTICLE_FLOATS * 4;
export const MAX_PARTICLES = 1024;
export const PARTICLE_GRAVITY = 22;
/** Fraction of vertical speed kept when bouncing off the floor, and horizontal friction on contact. */
export const PARTICLE_RESTITUTION = 0.35;
export const PARTICLE_FRICTION = 0.7;
export const MIN_BURST = 16;
export const MAX_BURST = 24;

/** Integrates one particle for `dt` seconds in place. Mirrors `simulate` in particles.wgsl. */
export function stepParticle(p: Float32Array, o: number, dt: number, gravity: number): void {
  if (p[o + 3]! <= 0) return;
  p[o + 5] = p[o + 5]! - gravity * dt;
  p[o] = p[o]! + p[o + 4]! * dt;
  p[o + 1] = p[o + 1]! + p[o + 5]! * dt;
  p[o + 2] = p[o + 2]! + p[o + 6]! * dt;
  const half = p[o + 7]! * 0.5;
  const floor = p[o + 8]!;
  if (p[o + 1]! - half < floor) {
    p[o + 1] = floor + half;
    if (p[o + 5]! < 0) {
      p[o + 5] = -p[o + 5]! * PARTICLE_RESTITUTION;
      p[o + 4] = p[o + 4]! * PARTICLE_FRICTION;
      p[o + 6] = p[o + 6]! * PARTICLE_FRICTION;
    }
  }
  p[o + 3] = p[o + 3]! - dt;
}

export function stepParticles(p: Float32Array, dt: number, gravity = PARTICLE_GRAVITY): void {
  for (let o = 0; o < p.length; o += PARTICLE_FLOATS) stepParticle(p, o, dt, gravity);
}

/** A contiguous range of particle slots written by a burst (for queue.writeBuffer). */
export interface SlotRange {
  first: number;
  count: number;
}

/**
 * CPU-side ring allocator + staging copy of the particle buffer. New bursts overwrite the oldest
 * slots; `spawnBurst` returns the dirty slot ranges (at most two when the ring wraps).
 */
export class ParticleRing {
  readonly data: Float32Array<ArrayBuffer> = new Float32Array(MAX_PARTICLES * PARTICLE_FLOATS);
  private next = 0;

  constructor(private readonly random: () => number = Math.random) {}

  /**
   * Emits 16–24 fragments of `block` from the voxel whose minimum corner is (x, y, z). Fragments
   * start inside the voxel, burst outwards and upwards, and bounce on `floorY`.
   */
  spawnBurst(block: number, x: number, y: number, z: number, floorY: number): SlotRange[] {
    const rnd = this.random;
    const count = MIN_BURST + Math.floor(rnd() * (MAX_BURST - MIN_BURST + 1));
    const first = this.next;
    for (let i = 0; i < count; i++) {
      const o = this.next * PARTICLE_FLOATS;
      const size = 0.1 + rnd() * 0.1;
      const px = x + 0.15 + rnd() * 0.7, py = y + 0.15 + rnd() * 0.7, pz = z + 0.15 + rnd() * 0.7;
      const life = 0.9 + rnd() * 0.8;
      const d = this.data;
      d[o] = px; d[o + 1] = py; d[o + 2] = pz; d[o + 3] = life;
      d[o + 4] = (px - x - 0.5) * 5 + (rnd() - 0.5) * 1.5;
      d[o + 5] = 2.5 + rnd() * 3;
      d[o + 6] = (pz - z - 0.5) * 5 + (rnd() - 0.5) * 1.5;
      d[o + 7] = size;
      d[o + 8] = floorY; d[o + 9] = block; d[o + 10] = rnd(); d[o + 11] = life;
      this.next = (this.next + 1) % MAX_PARTICLES;
    }
    if (first + count <= MAX_PARTICLES) return [{ first, count }];
    return [{ first, count: MAX_PARTICLES - first }, { first: 0, count: first + count - MAX_PARTICLES }];
  }

  /** Mirrors the GPU simulation on the CPU copy (tests / tooling). */
  step(dt: number): void {
    stepParticles(this.data, dt);
  }

  alive(): number {
    let n = 0;
    for (let o = 3; o < this.data.length; o += PARTICLE_FLOATS) if (this.data[o]! > 0) n++;
    return n;
  }
}
