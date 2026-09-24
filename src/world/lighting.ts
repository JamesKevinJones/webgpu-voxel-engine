import {
  BLOCK_TYPE_COUNT,
  lightAttenuation,
  lightEmission,
  passesSunbeam,
} from './block';
import { CHUNK_MASK, CHUNK_SIZE, CHUNK_VOLUME, worldToChunk } from './coords';
import { PADDED_SIZE, PADDED_VOLUME } from './mesh-format';
import type { PalettedChunk } from './palette-chunk';

/**
 * Dual-channel voxel lighting.
 *
 * Every voxel stores one byte: skylight in the high nibble, block light (torches) in the low
 * nibble, both 0..15. Light spreads by breadth-first flood fill, losing one level per step (plus
 * the block's extra attenuation). Skylight has one special rule: level 15 travels straight down
 * through fully transparent blocks without loss, so open sky lights everything below it until the
 * first opaque block, and from there spreads sideways into caves and overhangs.
 *
 * Removal (a block placed into light, a torch mined) uses the classic two-queue scheme: a removal
 * flood clears every level that depended on the removed light and collects the brighter
 * boundary voxels, which are then re-flooded.
 */

export const MAX_LIGHT = 15;
export const SKY_SHIFT = 4;
/** Light byte of fully sky-lit voxels (sky 15, block 0). */
export const FULL_SKY = MAX_LIGHT << SKY_SHIFT;

export function packLight(sky: number, block: number): number {
  return ((sky & 15) << SKY_SHIFT) | (block & 15);
}

export function skyLight(packed: number): number {
  return packed >> SKY_SHIFT;
}

export function blockLight(packed: number): number {
  return packed & 15;
}

/** Light values of one chunk; stays a single uniform value until a voxel differs. */
export class ChunkLight {
  data: Uint8Array | null = null;
  fill: number;

  constructor(fill = 0) {
    this.fill = fill;
  }

  get(index: number): number {
    return this.data ? this.data[index]! : this.fill;
  }

  set(index: number, value: number): void {
    if (!this.data) {
      if (value === this.fill) return;
      this.data = new Uint8Array(CHUNK_VOLUME).fill(this.fill);
    }
    this.data[index] = value;
  }

  reset(fill: number): void {
    this.data = null;
    this.fill = fill;
  }

  get byteLength(): number {
    return this.data ? this.data.byteLength : 0;
  }
}

/** What the light engine needs to know about a chunk. `ChunkRecord` satisfies it. */
export interface LightChunk {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  /** Voxels; null while the chunk is not generated (light never enters it). */
  data: PalettedChunk | null;
  light: ChunkLight;
  /** Initial lighting done; unlit chunks are treated as walls by the flood fill. */
  lit: boolean;
}

export interface LightWorld {
  chunkAt(cx: number, cy: number, cz: number): LightChunk | undefined;
  /** Highest chunk layer: the layer above it is open sky. */
  readonly maxChunkY: number;
  /** Called for every voxel whose light changed (for remeshing). */
  lightChanged(chunk: LightChunk, lx: number, ly: number, lz: number): void;
}

// Per-block lookup tables (indexed by block id).
const ATTENUATION = new Int8Array(BLOCK_TYPE_COUNT);
const SUNBEAM = new Uint8Array(BLOCK_TYPE_COUNT);
const EMISSION = new Uint8Array(BLOCK_TYPE_COUNT);
for (let b = 0; b < BLOCK_TYPE_COUNT; b++) {
  ATTENUATION[b] = lightAttenuation(b);
  SUNBEAM[b] = passesSunbeam(b) ? 1 : 0;
  EMISSION[b] = lightEmission(b);
}
const EMITTERS = [...EMISSION.keys()].filter((b) => EMISSION[b]! > 0);

type Channel = 0 | 1;
const Channel = { Sky: 0, Block: 1 } as const;
const CHANNELS: readonly Channel[] = [Channel.Sky, Channel.Block];

// Neighbour directions: +X -X +Y -Y +Z -Z (index 3 = down).
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;
/** Local index delta per direction (x fastest, then y, then z). */
const DI = [1, -1, CHUNK_SIZE, -CHUNK_SIZE, CHUNK_SIZE * CHUNK_SIZE, -CHUNK_SIZE * CHUNK_SIZE];

/** Growable FIFO of (chunk, local index, level) entries. */
class LightQueue {
  chunks: LightChunk[] = [];
  index = new Int32Array(4096);
  level = new Uint8Array(4096);
  head = 0;
  tail = 0;

  push(chunk: LightChunk, index: number, level: number): void {
    if (this.tail === this.index.length) {
      if (this.head > 0 && this.head >= this.tail / 2) {
        this.index.copyWithin(0, this.head, this.tail);
        this.level.copyWithin(0, this.head, this.tail);
        this.chunks.copyWithin(0, this.head, this.tail);
        this.tail -= this.head;
        this.chunks.length = this.tail;
        this.head = 0;
      } else {
        const index = new Int32Array(this.index.length * 2);
        index.set(this.index);
        this.index = index;
        const level = new Uint8Array(this.level.length * 2);
        level.set(this.level);
        this.level = level;
      }
    }
    this.chunks[this.tail] = chunk;
    this.index[this.tail] = index;
    this.level[this.tail] = level;
    this.tail++;
  }

  get empty(): boolean {
    return this.head === this.tail;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.chunks.length = 0;
  }
}

function readChannel(chunk: LightChunk, index: number, channel: Channel): number {
  const v = chunk.light.get(index);
  return channel === Channel.Sky ? v >> SKY_SHIFT : v & 15;
}

/** Propagated level entering a voxel of `block` from a neighbour at `level` moving in direction `dir`. */
function transmitted(level: number, block: number, channel: Channel, dir: number): number {
  const att = ATTENUATION[block]!;
  if (att < 0) return 0;
  if (channel === Channel.Sky && dir === DOWN && level === MAX_LIGHT && SUNBEAM[block]) return MAX_LIGHT;
  return Math.max(0, level - 1 - att);
}

export class LightEngine {
  private readonly add = [new LightQueue(), new LightQueue()];
  private readonly remove = [new LightQueue(), new LightQueue()];
  /** Voxel updates processed (for stats / budgeting). */
  work = 0;

  constructor(private readonly world: LightWorld) {}

  private write(chunk: LightChunk, index: number, channel: Channel, level: number): void {
    const old = chunk.light.get(index);
    const next = channel === Channel.Sky ? (old & 15) | (level << SKY_SHIFT) : (old & 0xf0) | level;
    if (next === old) return;
    chunk.light.set(index, next);
    this.world.lightChanged(chunk, index & CHUNK_MASK, (index >> 5) & CHUNK_MASK, index >> 10);
  }

  /** Neighbour chunk/index of (chunk, index) in direction dir, or null if not lightable. */
  private step(chunk: LightChunk, index: number, dir: number, out: { chunk: LightChunk; index: number }): boolean {
    const lx = index & CHUNK_MASK, ly = (index >> 5) & CHUNK_MASK, lz = index >> 10;
    const nx = lx + DX[dir]!, ny = ly + DY[dir]!, nz = lz + DZ[dir]!;
    if ((nx | ny | nz) >= 0 && nx < CHUNK_SIZE && ny < CHUNK_SIZE && nz < CHUNK_SIZE) {
      out.chunk = chunk;
      out.index = index + DI[dir]!;
      return true;
    }
    const n = this.world.chunkAt(chunk.cx + DX[dir]!, chunk.cy + DY[dir]!, chunk.cz + DZ[dir]!);
    if (!n || !n.lit || !n.data) return false;
    out.chunk = n;
    out.index = (nx & CHUNK_MASK) | ((ny & CHUNK_MASK) << 5) | ((nz & CHUNK_MASK) << 10);
    return true;
  }

  private readonly cursor = { chunk: null as unknown as LightChunk, index: 0 };

  /** Floods queued light outward until every queue is empty. */
  private propagate(): void {
    for (const channel of CHANNELS) {
      const rq = this.remove[channel]!;
      const aq = this.add[channel]!;
      const n = this.cursor;
      // 1. Removal: clear everything that was lit by the removed light, remember brighter borders.
      while (rq.head < rq.tail) {
        const chunk = rq.chunks[rq.head]!, index = rq.index[rq.head]!, level = rq.level[rq.head]!;
        rq.head++;
        this.work++;
        for (let dir = 0; dir < 6; dir++) {
          if (!this.step(chunk, index, dir, n)) continue;
          const nl = readChannel(n.chunk, n.index, channel);
          if (nl === 0) continue;
          const dependent = nl < level || (channel === Channel.Sky && dir === DOWN && level === MAX_LIGHT && nl === MAX_LIGHT);
          if (dependent) {
            this.write(n.chunk, n.index, channel, 0);
            rq.push(n.chunk, n.index, nl);
            if (channel === Channel.Block) {
              const e = EMISSION[n.chunk.data!.get(n.index)]!;
              if (e > 0) {
                this.write(n.chunk, n.index, channel, e);
                aq.push(n.chunk, n.index, e);
              }
            }
          } else {
            aq.push(n.chunk, n.index, nl);
          }
        }
      }
      rq.clear();
      // 2. Addition: breadth-first flood fill.
      while (aq.head < aq.tail) {
        const chunk = aq.chunks[aq.head]!, index = aq.index[aq.head]!;
        aq.head++;
        const level = readChannel(chunk, index, channel);
        if (level <= 1) continue;
        this.work++;
        for (let dir = 0; dir < 6; dir++) {
          if (!this.step(chunk, index, dir, n)) continue;
          const next = transmitted(level, n.chunk.data!.get(n.index), channel, dir);
          if (next > readChannel(n.chunk, n.index, channel)) {
            this.write(n.chunk, n.index, channel, next);
            aq.push(n.chunk, n.index, next);
          }
        }
      }
      aq.clear();
    }
  }

  /**
   * Initial lighting of a freshly generated chunk: skylight columns from the chunk above (or open
   * sky at the top of the world), torch emission, then a flood fill that also exchanges light with
   * every already-lit neighbour across the shared faces.
   */
  lightChunk(chunk: LightChunk): void {
    const data = chunk.data;
    if (!data) throw new Error('cannot light a chunk without voxel data');
    const above = chunk.cy >= this.world.maxChunkY ? null : this.world.chunkAt(chunk.cx, chunk.cy + 1, chunk.cz);
    const openSky = chunk.cy >= this.world.maxChunkY;
    const aboveLit = above && above.lit && above.data ? above : null;
    const uniform = data.uniformBlock();
    const light = chunk.light;
    light.reset(0);
    chunk.lit = true;

    const aboveAllSky = openSky || (aboveLit !== null && aboveLit.light.data === null && aboveLit.light.fill === FULL_SKY);
    if (uniform >= 0 && aboveAllSky && SUNBEAM[uniform]) {
      // Fully transparent chunk under open sky: uniformly lit, nothing to flood internally.
      light.reset(FULL_SKY);
    } else if (uniform < 0 || ATTENUATION[uniform]! >= 0) {
      this.skyColumns(chunk, openSky, aboveLit);
    }
    if (EMITTERS.some((b) => data.countOf(b) > 0)) {
      for (let i = 0; i < CHUNK_VOLUME; i++) {
        const e = EMISSION[data.get(i)]!;
        if (e > 0) {
          this.write(chunk, i, Channel.Block, e);
          this.add[Channel.Block]!.push(chunk, i, e);
        }
      }
    }
    this.exchangeBorders(chunk);
    this.propagate();
  }

  /** Straight-down sunbeams through the chunk; seeds the flood fill where beams stop or neighbours are darker. */
  private skyColumns(chunk: LightChunk, openSky: boolean, above: LightChunk | null): void {
    const data = chunk.data!;
    const light = chunk.light;
    const aq = this.add[Channel.Sky]!;
    const bottom = new Int8Array(CHUNK_SIZE * CHUNK_SIZE).fill(CHUNK_SIZE); // lowest y reached by a beam (32 = none)
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        let incoming = openSky ? MAX_LIGHT : 0;
        if (above) incoming = above.light.get(x | (z << 10)) >> SKY_SHIFT;
        if (incoming === 0) continue;
        if (incoming < MAX_LIGHT) {
          // Dimmer light from above is handled by the border exchange flood fill.
          continue;
        }
        let y = CHUNK_SIZE - 1;
        for (; y >= 0; y--) {
          const i = x | (y << 5) | (z << 10);
          if (!SUNBEAM[data.get(i)]) break;
          light.set(i, FULL_SKY);
        }
        bottom[x + z * CHUNK_SIZE] = y + 1;
        if (y >= 0) {
          // The beam stops here: flood from the last lit voxel (or from above for the top voxel).
          if (y + 1 < CHUNK_SIZE) aq.push(chunk, x | ((y + 1) << 5) | (z << 10), MAX_LIGHT);
        }
      }
    }
    // Beams next to shorter beams (cliffs, overhangs, cave mouths) spread sideways.
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const b = bottom[x + z * CHUNK_SIZE]!;
        let deepest = b;
        if (x > 0) deepest = Math.max(deepest, bottom[x - 1 + z * CHUNK_SIZE]!);
        if (x < CHUNK_MASK) deepest = Math.max(deepest, bottom[x + 1 + z * CHUNK_SIZE]!);
        if (z > 0) deepest = Math.max(deepest, bottom[x + (z - 1) * CHUNK_SIZE]!);
        if (z < CHUNK_MASK) deepest = Math.max(deepest, bottom[x + (z + 1) * CHUNK_SIZE]!);
        for (let y = b; y < deepest && y < CHUNK_SIZE; y++) aq.push(chunk, x | (y << 5) | (z << 10), MAX_LIGHT);
      }
    }
  }

  /** Queues voxels on either side of the chunk's faces whose light can improve the other side. */
  private exchangeBorders(chunk: LightChunk): void {
    for (let dir = 0; dir < 6; dir++) {
      const n = this.world.chunkAt(chunk.cx + DX[dir]!, chunk.cy + DY[dir]!, chunk.cz + DZ[dir]!);
      if (!n || !n.lit || !n.data) continue;
      const axis = dir >> 1;
      const positive = (dir & 1) === 0;
      const mine = positive ? CHUNK_MASK : 0; // my face layer along the axis
      const theirs = positive ? 0 : CHUNK_MASK;
      const back = dir ^ 1;
      for (let b = 0; b < CHUNK_SIZE; b++) {
        for (let a = 0; a < CHUNK_SIZE; a++) {
          let mi: number, ni: number;
          if (axis === 0) {
            mi = mine | (a << 5) | (b << 10);
            ni = theirs | (a << 5) | (b << 10);
          } else if (axis === 1) {
            mi = a | (mine << 5) | (b << 10);
            ni = a | (theirs << 5) | (b << 10);
          } else {
            mi = a | (b << 5) | (mine << 10);
            ni = a | (b << 5) | (theirs << 10);
          }
          const ml = chunk.light.get(mi), nl = n.light.get(ni);
          if (ml === nl && ml === 0) continue;
          const mb = chunk.data!.get(mi), nb = n.data.get(ni);
          for (const channel of CHANNELS) {
            const mv = channel === Channel.Sky ? ml >> SKY_SHIFT : ml & 15;
            const nv = channel === Channel.Sky ? nl >> SKY_SHIFT : nl & 15;
            if (mv > 1 && transmitted(mv, nb, channel, dir) > nv) this.add[channel]!.push(chunk, mi, mv);
            if (nv > 1 && transmitted(nv, mb, channel, back) > mv) this.add[channel]!.push(n, ni, nv);
          }
        }
      }
    }
  }

  /**
   * Updates light after the block at a voxel changed from `previous` to its current value: removes
   * light that can no longer pass or was emitted by the old block, then re-floods from the new
   * emitter and from every neighbour.
   */
  blockChanged(chunk: LightChunk, index: number, previous: number): void {
    if (!chunk.lit || !chunk.data) return;
    const block = chunk.data.get(index);
    if (block === previous) return;
    const n = this.cursor;
    for (const channel of CHANNELS) {
      const old = readChannel(chunk, index, channel);
      if (old > 0) {
        this.write(chunk, index, channel, 0);
        this.remove[channel]!.push(chunk, index, old);
      }
      if (channel === Channel.Block && EMISSION[block]! > 0) {
        this.write(chunk, index, channel, EMISSION[block]!);
        this.add[channel]!.push(chunk, index, EMISSION[block]!);
      }
      if (ATTENUATION[block]! >= 0) {
        // Let the neighbours shine into the (now more transparent) voxel.
        for (let dir = 0; dir < 6; dir++) {
          if (!this.step(chunk, index, dir, n)) continue;
          const nl = readChannel(n.chunk, n.index, channel);
          if (nl > 0) this.add[channel]!.push(n.chunk, n.index, nl);
        }
        if (channel === Channel.Sky && chunk.cy >= this.world.maxChunkY && (index >> 5 & CHUNK_MASK) === CHUNK_MASK && SUNBEAM[block]) {
          this.write(chunk, index, channel, MAX_LIGHT);
          this.add[channel]!.push(chunk, index, MAX_LIGHT);
        }
      }
    }
    this.propagate();
  }
}

/** Light byte at a world voxel through `chunkAt`, with open sky above the world and darkness elsewhere. */
export function lightAt(world: Pick<LightWorld, 'chunkAt' | 'maxChunkY'>, x: number, y: number, z: number): number {
  const cy = worldToChunk(y);
  if (cy > world.maxChunkY) return FULL_SKY;
  const c = world.chunkAt(worldToChunk(x), cy, worldToChunk(z));
  if (!c || !c.lit) return FULL_SKY;
  return c.light.get((x & CHUNK_MASK) | ((y & CHUNK_MASK) << 5) | ((z & CHUNK_MASK) << 10));
}

/**
 * Dense (34³) light volume of a chunk plus its one-voxel border, in the same layout as the padded
 * block volume the mesher reads. Missing or unlit neighbours read as open sky, so faces at the
 * streaming frontier are not black.
 */
export function buildPaddedLight(
  neighbors: readonly (ChunkLight | null | undefined)[],
  out: Uint8Array = new Uint8Array(PADDED_VOLUME),
): Uint8Array {
  const P = PADDED_SIZE;
  for (let pz = 0; pz < P; pz++) {
    const dz = pz === 0 ? -1 : pz === P - 1 ? 1 : 0;
    const lz = (pz - 1) & CHUNK_MASK;
    for (let py = 0; py < P; py++) {
      const dy = py === 0 ? -1 : py === P - 1 ? 1 : 0;
      const ly = (py - 1) & CHUNK_MASK;
      const row = (pz * P + py) * P;
      const rowBase = (ly << 5) | (lz << 10);
      const nIndex = (dy + 1) * 3 + (dz + 1) * 9;
      const left = neighbors[nIndex], centre = neighbors[nIndex + 1], right = neighbors[nIndex + 2];
      out[row] = left ? left.get(rowBase | CHUNK_MASK) : FULL_SKY;
      if (!centre) {
        out.fill(FULL_SKY, row + 1, row + 1 + CHUNK_SIZE);
      } else if (!centre.data) {
        out.fill(centre.fill, row + 1, row + 1 + CHUNK_SIZE);
      } else {
        out.set(centre.data.subarray(rowBase, rowBase + CHUNK_SIZE), row + 1);
      }
      out[row + P - 1] = right ? right.get(rowBase) : FULL_SKY;
    }
  }
  return out;
}
