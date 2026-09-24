import { describe, expect, it } from 'vitest';
import { BlockType, MAX_WATER_LEVEL, isWater, waterLevel } from '../src/world/block';
import { FluidSim, type FluidWorld } from '../src/world/fluids';

/** Sparse test world: a bounded box of loaded voxels (outside reads as unloaded). */
class Box implements FluidWorld {
  readonly blocks = new Map<string, number>();
  writes = 0;
  constructor(readonly size = 40, readonly height = 24, private readonly fill: (x: number, y: number, z: number) => number = () => BlockType.Air) {}

  inside(x: number, y: number, z: number): boolean {
    return Math.abs(x) <= this.size && Math.abs(z) <= this.size && y >= 0 && y < this.height;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return -1;
    return this.blocks.get(`${x},${y},${z}`) ?? this.fill(x, y, z);
  }

  setBlock(x: number, y: number, z: number, block: number): boolean {
    if (!this.inside(x, y, z) || this.getBlock(x, y, z) === block) return false;
    this.blocks.set(`${x},${y},${z}`, block);
    this.writes++;
    return true;
  }

  /** Player edit: write the block and wake the simulation around it. */
  edit(sim: FluidSim, x: number, y: number, z: number, block: number): void {
    this.setBlock(x, y, z, block);
    sim.scheduleAround(x, y, z);
  }
}

const flat = (floor: number) => (_x: number, y: number) => (y <= floor ? BlockType.Stone : BlockType.Air);

function settle(sim: FluidSim, maxTicks = 200): number {
  for (let t = 0; t < maxTicks; t++) if (sim.tick() === 0 && sim.queued === 0) return t;
  throw new Error('fluid did not settle');
}

describe('fluid simulation', () => {
  it('spreads a source on flat ground exactly 7 blocks with one level per block', () => {
    const w = new Box(20, 10, flat(0));
    const sim = new FluidSim(w);
    w.edit(sim, 0, 1, 0, BlockType.Water);
    settle(sim);
    for (let d = 1; d <= MAX_WATER_LEVEL; d++) {
      expect(waterLevel(w.getBlock(d, 1, 0)), `x=${d}`).toBe(d);
      expect(waterLevel(w.getBlock(0, 1, -d)), `z=-${d}`).toBe(d);
    }
    // Levels follow the Manhattan distance and stop after 7.
    expect(waterLevel(w.getBlock(3, 1, 4))).toBe(7);
    expect(w.getBlock(MAX_WATER_LEVEL + 1, 1, 0)).toBe(BlockType.Air);
    expect(w.getBlock(4, 1, 4)).toBe(BlockType.Air);
    // Nothing climbs up.
    expect(w.getBlock(1, 2, 0)).toBe(BlockType.Air);
    let cells = 0;
    for (const b of w.blocks.values()) if (isWater(b)) cells++;
    expect(cells).toBe(1 + 2 * 7 * 8); // |x| + |z| <= 7 diamond
  });

  it('flows down first and only spreads once it lands', () => {
    // Floor at y = 0 with a 1-block ledge at y = 10 around the origin (x, z in -1..1).
    const w = new Box(20, 16, (x, y, z) => (y === 0 || (y === 10 && Math.abs(x) <= 1 && Math.abs(z) <= 1) ? BlockType.Stone : BlockType.Air));
    const sim = new FluidSim(w);
    w.edit(sim, 1, 11, 0, BlockType.Water);
    settle(sim);
    // Spreads on the ledge; the flow that runs off the edge falls to the floor.
    expect(w.getBlock(0, 11, 0)).toBe(BlockType.WaterFlow1);
    expect(w.getBlock(2, 11, 0)).toBe(BlockType.WaterFlow1);
    for (let y = 1; y <= 10; y++) expect(w.getBlock(2, y, 0), `y=${y}`).toBe(BlockType.WaterFalling);
    // Water in the air beside the ledge falls and never spreads sideways mid-air.
    expect(w.getBlock(3, 11, 0)).toBe(BlockType.Air);
    expect(w.getBlock(3, 5, 0)).toBe(BlockType.Air);
    // The landing point acts like a new source: 7 more blocks along the floor.
    expect(w.getBlock(2, 1, 0)).toBe(BlockType.WaterFalling);
    expect(w.getBlock(3, 1, 0)).toBe(BlockType.WaterFlow1);
    expect(w.getBlock(9, 1, 0)).toBe(BlockType.WaterFlow7);
    expect(w.getBlock(10, 1, 0)).toBe(BlockType.Air);
  });

  it('dries up completely when the source is removed', () => {
    const w = new Box(20, 10, flat(0));
    const sim = new FluidSim(w);
    w.edit(sim, 0, 1, 0, BlockType.Water);
    settle(sim);
    w.edit(sim, 0, 1, 0, BlockType.Stone);
    settle(sim);
    for (const b of w.blocks.values()) expect(isWater(b)).toBe(false);
  });

  it('does not spill a waterfall over a lake surface, but floods a hole dug next to the lake', () => {
    // Lake of sources at y 1..3 for x <= 0, sand shore at x >= 1 (y <= 3).
    const lake = (x: number, y: number) => (y === 0 ? BlockType.Stone : y <= 3 ? (x <= 0 ? BlockType.Water : BlockType.Sand) : BlockType.Air);
    const w = new Box(20, 12, lake);
    const sim = new FluidSim(w);
    w.edit(sim, -5, 8, 0, BlockType.Water);
    settle(sim);
    for (let y = 4; y <= 7; y++) expect(w.getBlock(-5, y, 0)).toBe(BlockType.WaterFalling);
    expect(w.getBlock(-4, 4, 0)).toBe(BlockType.Air);
    expect(w.getBlock(-6, 4, 0)).toBe(BlockType.Air);
    // Dig the shore block next to the lake: water rushes in (the lake's sources rest on water).
    w.edit(sim, 1, 3, 0, BlockType.Air);
    settle(sim);
    expect(w.getBlock(1, 3, 0)).toBe(BlockType.WaterFlow1);
    // Digging down under it turns it into a waterfall that lands and spreads.
    w.edit(sim, 1, 2, 0, BlockType.Air);
    settle(sim);
    expect(w.getBlock(1, 2, 0)).toBe(BlockType.WaterFalling);
  });

  it('washes away plants and torches in its path', () => {
    const w = new Box(10, 6, flat(0));
    w.blocks.set('2,1,0', BlockType.TallGrass);
    w.blocks.set('0,1,2', BlockType.Torch);
    const sim = new FluidSim(w);
    w.edit(sim, 0, 1, 0, BlockType.Water);
    settle(sim);
    expect(w.getBlock(2, 1, 0)).toBe(BlockType.WaterFlow2);
    expect(w.getBlock(0, 1, 2)).toBe(BlockType.WaterFlow2);
  });

  it('never writes outside loaded terrain and bounds the work per step', () => {
    const w = new Box(3, 6, flat(0));
    const sim = new FluidSim(w, { maxUpdatesPerTick: 5 });
    w.edit(sim, 0, 1, 0, BlockType.Water);
    const queued = sim.queued;
    expect(queued).toBe(7);
    sim.tick();
    expect(sim.queued).toBeGreaterThanOrEqual(2); // 2 cells carried over + newly scheduled ones
    settle(sim, 500);
    expect(w.getBlock(4, 1, 0)).toBe(-1);
    expect(waterLevel(w.getBlock(3, 1, 0))).toBe(3);
  });

  it('runs steps on its own clock', () => {
    const w = new Box(10, 6, flat(0));
    const sim = new FluidSim(w, { tickInterval: 0.25 });
    w.edit(sim, 0, 1, 0, BlockType.Water);
    expect(sim.update(0.1)).toBe(0);
    expect(sim.update(0.2)).toBeGreaterThan(0);
    expect(sim.ticks).toBe(1);
    sim.update(10); // catch-up is capped
    expect(sim.ticks).toBe(3);
  });
});
