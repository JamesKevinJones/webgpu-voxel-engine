import {
  BlockType,
  MAX_WATER_LEVEL,
  flowingWater,
  isFluidReplaceable,
  isWater,
  waterLevel,
} from './block';

/** Voxel access for the fluid simulation (`ChunkManager` and the engine satisfy it). */
export interface FluidWorld {
  /** Block at a voxel, or -1 when it is not loaded. */
  getBlock(x: number, y: number, z: number): number;
  /** Writes a voxel; returns false if it could not be changed. */
  setBlock(x: number, y: number, z: number, block: number): boolean;
}

export interface FluidConfig {
  /** Seconds between automaton steps. */
  tickInterval: number;
  /** Most cells evaluated per step; the rest wait for the next step. */
  maxUpdatesPerTick: number;
  /** Most steps run in one `update` call (catch-up after a slow frame). */
  maxTicksPerUpdate: number;
}

export const DEFAULT_FLUID_CONFIG: FluidConfig = {
  tickInterval: 0.25,
  maxUpdatesPerTick: 4096,
  maxTicksPerUpdate: 2,
};

// Packs a voxel into one safe integer: 20 bits x, 20 bits z, 10 bits y.
const XZ_BIAS = 1 << 19;
const Y_BIAS = 1 << 9;
function packCell(x: number, y: number, z: number): number {
  return ((x + XZ_BIAS) * 1048576 + (z + XZ_BIAS)) * 1024 + (y + Y_BIAS);
}

const HORIZONTAL: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Blocks that stop water (solids, glass, and anything not loaded). */
function stopsWater(block: number): boolean {
  return block < 0 || (!isWater(block) && !isFluidReplaceable(block));
}

/**
 * Minecraft-style water as a cellular automaton over "dirty" cells.
 *
 * Sources (`BlockType.Water`, all generated water) never change. Every other cell derives its
 * state from its neighbours:
 *  - water directly above → falling water (full height); downward flow always wins,
 *  - otherwise the lowest level among horizontal water neighbours that spread sideways, plus
 *    one, as flowing water, up to MAX_WATER_LEVEL (7) steps; beyond that, or with no neighbour,
 *    the flow dries up.
 * A neighbour spreads sideways only when it cannot flow down: when the block below it stops water,
 * or when it is a source resting on another source (so a waterfall landing in a lake does not
 * spill over its surface, while breaking a lake shore does flood the hole).
 *
 * Cells are evaluated in steps (all states computed first, then applied), so the result does not
 * depend on iteration order. Every applied change schedules the cell's neighbours for the next
 * step; edits made by the player schedule the edited cell and its neighbours.
 */
export class FluidSim {
  readonly config: FluidConfig;
  private pending = new Set<number>();
  private next = new Set<number>();
  private accumulator = 0;
  /** Cells changed by the most recent step, and in total. */
  lastChanges = 0;
  totalChanges = 0;
  ticks = 0;

  constructor(private readonly world: FluidWorld, config: Partial<FluidConfig> = {}) {
    this.config = { ...DEFAULT_FLUID_CONFIG, ...config };
  }

  /** Cells waiting to be evaluated. */
  get queued(): number {
    return this.pending.size + this.next.size;
  }

  schedule(x: number, y: number, z: number): void {
    this.next.add(packCell(x, y, z));
  }

  /** Schedules a cell and its six neighbours (after an edit at that cell). */
  scheduleAround(x: number, y: number, z: number): void {
    this.schedule(x, y, z);
    this.schedule(x + 1, y, z);
    this.schedule(x - 1, y, z);
    this.schedule(x, y + 1, z);
    this.schedule(x, y - 1, z);
    this.schedule(x, y, z + 1);
    this.schedule(x, y, z - 1);
  }

  clear(): void {
    this.pending.clear();
    this.next.clear();
    this.accumulator = 0;
  }

  /** Advances the simulation clock; runs whole steps as they become due. Returns cells changed. */
  update(dt: number): number {
    this.accumulator += dt;
    let changed = 0;
    for (let i = 0; i < this.config.maxTicksPerUpdate && this.accumulator >= this.config.tickInterval; i++) {
      this.accumulator -= this.config.tickInterval;
      changed += this.tick();
    }
    // Never build up an unbounded backlog of simulated time.
    this.accumulator = Math.min(this.accumulator, this.config.tickInterval);
    return changed;
  }

  /** The state the automaton wants for a cell (unchanged for cells it does not own). */
  desiredState(x: number, y: number, z: number): number {
    const w = this.world;
    const b = w.getBlock(x, y, z);
    if (b < 0 || b === BlockType.Water) return b;
    if (!isWater(b) && !isFluidReplaceable(b)) return b;
    if (isWater(w.getBlock(x, y + 1, z))) return BlockType.WaterFalling;
    let best = MAX_WATER_LEVEL + 1;
    for (const [dx, dz] of HORIZONTAL) {
      const n = w.getBlock(x + dx, y, z + dz);
      if (!isWater(n)) continue;
      const below = w.getBlock(x + dx, y - 1, z + dz);
      // Water that can still flow down (into air, plants or non-source water) does not spread.
      if (isFluidReplaceable(below) || (isWater(below) && below !== BlockType.Water)) continue;
      // On top of a full source only sources spread (a waterfall landing in a lake stays put).
      if (!stopsWater(below) && n !== BlockType.Water) continue;
      best = Math.min(best, waterLevel(n) + 1);
    }
    if (best <= MAX_WATER_LEVEL) return flowingWater(best);
    return isWater(b) ? BlockType.Air : b;
  }

  /** One automaton step over (at most `maxUpdatesPerTick`) scheduled cells. Returns cells changed. */
  tick(): number {
    // Cells scheduled since the last step join the ones left over from it.
    for (const key of this.next) this.pending.add(key);
    this.next.clear();
    const updates: number[] = [];
    let taken = 0;
    for (const key of this.pending) {
      if (taken >= this.config.maxUpdatesPerTick) break;
      this.pending.delete(key);
      taken++;
      const y = (key % 1024) - Y_BIAS;
      const xz = Math.floor(key / 1024);
      const z = (xz % 1048576) - XZ_BIAS;
      const x = Math.floor(xz / 1048576) - XZ_BIAS;
      const current = this.world.getBlock(x, y, z);
      const desired = this.desiredState(x, y, z);
      if (desired !== current) updates.push(x, y, z, desired);
    }
    let changed = 0;
    for (let i = 0; i < updates.length; i += 4) {
      const x = updates[i]!, y = updates[i + 1]!, z = updates[i + 2]!;
      if (this.world.setBlock(x, y, z, updates[i + 3]!)) {
        changed++;
        this.scheduleAround(x, y, z);
      }
    }
    this.ticks++;
    this.lastChanges = changed;
    this.totalChanges += changed;
    return changed;
  }
}
