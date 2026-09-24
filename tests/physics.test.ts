import { describe, expect, it } from 'vitest';
import { aabb, intersectsSolid, moveBox, sweepAxis, type SolidQuery } from '../src/physics/aabb';
import { Player, type PlayerInput, type PlayerWorld } from '../src/physics/player';

const set = (...cells: [number, number, number][]): SolidQuery => {
  const s = new Set(cells.map((c) => c.join(',')));
  return (x, y, z) => s.has(`${x},${y},${z}`);
};
/** Flat ground: every voxel with y < 0 is solid, plus extra cells. */
const ground = (extra: [number, number, number][] = []): SolidQuery => {
  const more = set(...extra);
  return (x, y, z) => y < 0 || more(x, y, z);
};
const NO_WATER = () => false;
const idle: PlayerInput = { forward: 0, strafe: 0, jump: false, sprint: false };
const walk = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...idle, forward: 1, ...over });

function simulate(player: Player, seconds: number, input: PlayerInput, world: PlayerWorld, yaw = 0, onTick?: () => void): void {
  const h = player.config.timestep;
  for (let t = 0; t < seconds; t += h) {
    player.tick(h, input, yaw, world);
    onTick?.();
  }
}

describe('sweepAxis', () => {
  it('stops a falling box exactly on the floor', () => {
    const box = aabb(0.2, 3.5, 0.2, 0.8, 5.3, 0.8);
    expect(sweepAxis(box, 1, -10, ground())).toBeCloseTo(-3.5, 10);
    expect(sweepAxis(box, 1, -1, ground())).toBe(-1); // free movement is untouched
  });

  it('blocks in every direction, including negative coordinates', () => {
    const solid = set([3, 0, 0], [-3, 0, 0], [0, 4, 0], [0, 0, -5]);
    const box = aabb(0.2, 0.1, 0.2, 0.8, 1.9, 0.8);
    expect(sweepAxis(box, 0, 5, solid)).toBeCloseTo(2.2);
    expect(sweepAxis(box, 0, -5, solid)).toBeCloseTo(-2.2);
    expect(sweepAxis(box, 1, 5, solid)).toBeCloseTo(2.1);
    expect(sweepAxis(box, 2, -9, solid)).toBeCloseTo(-4.2);
  });

  it('cannot tunnel through a thin wall at any speed', () => {
    const wall = set([10, 0, 0]);
    const box = aabb(0.2, 0.1, 0.2, 0.8, 0.9, 0.8);
    expect(sweepAxis(box, 0, 1000, wall)).toBeCloseTo(9.2);
  });

  it('ignores voxels the box only touches', () => {
    // Box resting against a wall on +X and on the floor: sliding along Z is free.
    const solid = set([1, 0, 0], [1, 0, 1], [1, 0, 2], [0, -1, 0], [0, -1, 1], [0, -1, 2]);
    const box = aabb(0.4, 0, 0.2, 1.0, 0.9, 0.8);
    expect(intersectsSolid(box, solid)).toBe(false);
    expect(sweepAxis(box, 2, 1.5, solid)).toBe(1.5);
    expect(sweepAxis(box, 0, 0.5, solid)).toBe(0);
  });
});

describe('moveBox', () => {
  it('slides along walls, keeping the tangential component', () => {
    const wall: SolidQuery = (x) => x >= 2;
    const box = aabb(0.2, 0.1, 0.2, 0.8, 1.9, 0.8);
    const r = moveBox(box, 3, 0, 2, wall);
    expect(r.hitX).toBe(true);
    expect(r.hitZ).toBe(false);
    expect(box.maxX).toBeCloseTo(2);
    expect(box.minZ).toBeCloseTo(2.2);
  });
});

describe('Player', () => {
  const world = (solid: SolidQuery, water: PlayerWorld['water'] = NO_WATER): PlayerWorld => ({ solid, water });

  it('uses a 0.6 × 1.8 box with eyes at 1.6 m', () => {
    const p = new Player();
    p.position.set([10.5, 3, -4.5]);
    const b = p.bounds();
    expect(b.maxX - b.minX).toBeCloseTo(0.6);
    expect(b.maxY - b.minY).toBeCloseTo(1.8);
    const eye = [0, 0, 0];
    p.eye(eye);
    expect(eye).toEqual([10.5, 4.6, -4.5]);
  });

  it('falls under gravity and lands on the ground', () => {
    const p = new Player();
    p.position.set([0.5, 10, 0.5]);
    let maxSpeed = 0;
    simulate(p, 2, idle, world(ground()), 0, () => { maxSpeed = Math.max(maxSpeed, -p.velocity[1]!); });
    expect(p.position[1]).toBeCloseTo(0, 6);
    expect(p.grounded).toBe(true);
    expect(p.velocity[1]).toBe(0);
    // Free fall of 10 m with g = 27.44 m/s² reaches ≈ sqrt(2 g h) ≈ 23.4 m/s.
    expect(maxSpeed).toBeGreaterThan(20);
    expect(maxSpeed).toBeLessThan(25);
  });

  it('jumps about 1.25 m and lands again', () => {
    const p = new Player();
    p.position.set([0.5, 0, 0.5]);
    simulate(p, 0.1, idle, world(ground()));
    expect(p.grounded).toBe(true);
    let apex = 0;
    simulate(p, 1.2, { ...idle, jump: true }, world(ground()), 0, () => { apex = Math.max(apex, p.position[1]!); });
    expect(apex).toBeGreaterThan(1.15);
    expect(apex).toBeLessThan(1.3);
    // Only jumps while grounded: no double jump mid-air.
    const q = new Player();
    q.position.set([0.5, 5, 0.5]);
    simulate(q, 0.2, { ...idle, jump: true }, world(ground()));
    expect(q.velocity[1]).toBeLessThan(0);
  });

  it('walks, sprints faster, and stops through ground friction', () => {
    const measure = (sprint: boolean): number => {
      const p = new Player();
      p.position.set([0.5, 0, 0.5]);
      simulate(p, 1, walk({ sprint }), world(ground()));
      return Math.hypot(p.velocity[0]!, p.velocity[2]!);
    };
    const walking = measure(false), sprinting = measure(true);
    expect(walking).toBeCloseTo(4.3, 1);
    expect(sprinting).toBeCloseTo(7.0, 1);

    const p = new Player();
    p.position.set([0.5, 0, 0.5]);
    simulate(p, 1, walk(), world(ground()));
    simulate(p, 0.5, idle, world(ground()));
    expect(Math.hypot(p.velocity[0]!, p.velocity[2]!)).toBeLessThan(0.01);
  });

  it('moves along the view direction (yaw 0 = -Z)', () => {
    const p = new Player();
    p.position.set([0.5, 0, 0.5]);
    simulate(p, 0.5, walk(), world(ground()), 0);
    expect(p.position[2]).toBeLessThan(-0.5);
    expect(Math.abs(p.position[0]! - 0.5)).toBeLessThan(1e-9);
    const q = new Player();
    q.position.set([0.5, 0, 0.5]);
    simulate(q, 0.5, walk(), world(ground()), Math.PI / 2);
    expect(q.position[0]).toBeLessThan(-0.5);
  });

  it('steps up single-block ledges but is stopped by two-block walls', () => {
    // A one-block step at z = -3 (walking towards -Z).
    const step = ground(Array.from({ length: 10 }, (_, i) => [0, 0, -3 - i] as [number, number, number]));
    const p = new Player();
    p.position.set([0.5, 0, 0.5]);
    simulate(p, 1.5, walk(), world(step));
    expect(p.position[1]).toBeCloseTo(1, 6);
    expect(p.position[2]).toBeLessThan(-4);
    expect(p.grounded).toBe(true);

    const wall = ground([[0, 0, -3], [0, 1, -3]]);
    const q = new Player();
    q.position.set([0.5, 0, 0.5]);
    simulate(q, 1.5, walk(), world(wall));
    expect(q.position[1]).toBeCloseTo(0, 6);
    expect(q.position[2]).toBeCloseTo(-2 + 0.3, 6); // box face touching the wall at z = -2
  });

  it('never ends up inside solid voxels while running around', () => {
    const cells: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) cells.push([((i * 7) % 11) - 5, (i * 3) % 2, ((i * 5) % 13) - 6]);
    const solid = ground(cells);
    const p = new Player();
    p.position.set([0.5, 0, 0.5]);
    for (let k = 0; k < 40; k++) {
      simulate(p, 0.25, walk({ sprint: k % 2 === 0, jump: k % 3 === 0, strafe: (k % 5) - 2 }), world(solid), k * 0.7, () => {
        expect(intersectsSolid(p.bounds(), solid)).toBe(false);
      });
    }
  });

  it('bumps its head on ceilings', () => {
    const solid = ground([[0, 2, 0]]);
    const p = new Player();
    p.position.set([0.5, 0, 0.5]);
    simulate(p, 0.05, idle, world(solid));
    let apex = 0;
    simulate(p, 0.6, { ...idle, jump: true }, world(solid), 0, () => { apex = Math.max(apex, p.position[1]!); });
    expect(apex).toBeCloseTo(0.2, 6); // head (1.8) meets the block at y = 2
  });

  it('swims: water slows the fall and jump swims upwards', () => {
    const water: PlayerWorld['water'] = (_x, y) => y < 10;
    const p = new Player();
    p.position.set([0.5, 8, 0.5]);
    simulate(p, 1, idle, world(ground(), water));
    expect(p.inWater).toBe(true);
    expect(p.velocity[1]).toBeGreaterThan(-3);
    const y = p.position[1]!;
    simulate(p, 1, { ...idle, jump: true }, world(ground(), water));
    expect(p.position[1]).toBeGreaterThan(y + 1);
  });

  it('is lifted out of terrain when spawned inside it', () => {
    const p = new Player();
    p.setFromEye(0.5, -3, 0.5);
    expect(p.resolveEmbedded(ground())).toBe(true);
    expect(p.position[1]).toBe(0);
    expect(intersectsSolid(p.bounds(), ground())).toBe(false);
  });

  it('accumulates variable frame times into fixed steps', () => {
    const a = new Player(), b = new Player();
    a.position.set([0.5, 5, 0.5]);
    b.position.set([0.5, 5, 0.5]);
    for (let i = 0; i < 60; i++) a.update(1 / 60, walk(), 0, world(ground()));
    for (let i = 0; i < 20; i++) b.update(1 / 20, walk(), 0, world(ground()));
    expect(a.position[2]).toBeCloseTo(b.position[2]!, 6);
    expect(a.position[1]).toBeCloseTo(b.position[1]!, 6);
  });
});
