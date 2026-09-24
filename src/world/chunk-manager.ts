import { BlockType } from './block';
import {
  CHUNK_MASK,
  chunkKey,
  localIndex,
  neighborIndex,
  worldToChunk,
} from './coords';
import { ChunkLight, LightEngine, type LightChunk, type LightWorld } from './lighting';
import { NO_SLOT } from './mesh-format';
import type { PalettedChunk } from './palette-chunk';
import { SlotAllocator } from './slot-allocator';
import { WORLD_MAX_CHUNK_Y, WORLD_MIN_CHUNK_Y } from './terrain';

export type ChunkState = 'pending' | 'generating' | 'ready';

export interface ChunkRecord {
  readonly key: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  state: ChunkState;
  /** CPU copy of the voxels (palette compressed), available once `ready`. */
  data: PalettedChunk | null;
  /** Slot in the GPU voxel pool, or -1 (all-air chunks release theirs). */
  voxelSlot: number;
  /** Slot in the GPU mesh pools, or -1. */
  meshSlot: number;
  needsMesh: boolean;
  /** True once a mesh job for the current mesh slot has been submitted. */
  hasMesh: boolean;
  /** Incremented per submitted mesh job; stale readbacks are discarded. */
  meshVersion: number;
  /** Incremented per submitted generation job. */
  genToken: number;
  /** Quad counts reported by the GPU for the latest mesh (-1 = not yet known). */
  opaqueQuads: number;
  waterQuads: number;
  cutoutQuads: number;
  /** CPU voxel data changed and must be re-uploaded to the GPU slot. */
  uploadPending: boolean;
  /** Skylight + block light (valid once `lit`). */
  light: ChunkLight;
  /** Initial lighting has run; meshing waits for it (and for the neighbours'). */
  lit: boolean;
  /** Neighbour chunks (bit = neighborIndex) whose meshes saw a light change in the current update. */
  lightTouch: number;
}

/** Saved player edits re-applied to chunks as they stream in (see storage/delta.ts). */
export interface ChunkEditSource {
  /** Local voxel index → block for one chunk, or undefined when the chunk is unmodified. */
  editsFor(cx: number, cy: number, cz: number): ReadonlyMap<number, number> | undefined;
}

export interface StreamingConfig {
  /** Horizontal streaming radius in chunks. */
  radius: number;
  minChunkY: number;
  maxChunkY: number;
  voxelSlots: number;
  meshSlots: number;
  /** Extra distance (chunks) beyond `radius` before a chunk is unloaded. */
  unloadMargin: number;
}

export const DEFAULT_STREAMING: StreamingConfig = {
  radius: 8,
  minChunkY: WORLD_MIN_CHUNK_Y,
  maxChunkY: WORLD_MAX_CHUNK_Y,
  voxelSlots: 1536,
  meshSlots: 640,
  unloadMargin: 1.5,
};

export interface GenerationJob {
  record: ChunkRecord;
  token: number;
  voxelSlot: number;
}

export interface MeshJob {
  record: ChunkRecord;
  version: number;
  meshSlot: number;
  /** Voxel slots of the 27 neighbours (index via `neighborIndex`), NO_SLOT for air/unloaded. */
  neighborSlots: Uint32Array;
  /** Light of the 27 neighbours (null = not lit, reads as open sky) for the padded light volume. */
  neighborLight: (ChunkLight | null)[];
}

/**
 * CPU-side bookkeeping for chunk streaming. Pure logic (no GPU calls) so it can be unit tested:
 *  - keeps the set of chunks within the streaming cylinder around the camera,
 *  - hands out generation and meshing work in nearest-first order,
 *  - owns voxel/mesh slot allocation and neighbour invalidation.
 */
export class ChunkManager implements LightWorld {
  readonly chunks = new Map<number, ChunkRecord>();
  readonly voxelSlots: SlotAllocator;
  readonly meshSlots: SlotAllocator;
  readonly config: StreamingConfig;
  readonly light: LightEngine;
  /** Saved edits applied to freshly generated chunks. */
  edits: ChunkEditSource | null = null;
  /** Generated chunks waiting for their initial lighting, in generation order. */
  private readonly lightQueue: ChunkRecord[] = [];
  private lightQueueHead = 0;
  private readonly touched: ChunkRecord[] = [];
  private centerX = Number.NaN;
  private centerY = 0;
  private centerZ = Number.NaN;
  private readonly meshQueue = new Set<ChunkRecord>();
  private readonly uploadQueue = new Set<ChunkRecord>();
  private pendingSorted: ChunkRecord[] = [];
  private pendingDirty = true;

  constructor(config: Partial<StreamingConfig> = {}) {
    this.config = { ...DEFAULT_STREAMING, ...config };
    this.voxelSlots = new SlotAllocator(this.config.voxelSlots);
    this.meshSlots = new SlotAllocator(this.config.meshSlots);
    this.light = new LightEngine(this);
  }

  // ------------------------------------------------------------------ LightWorld

  get maxChunkY(): number {
    return this.config.maxChunkY;
  }

  chunkAt(cx: number, cy: number, cz: number): LightChunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  lightChanged(chunk: LightChunk, lx: number, ly: number, lz: number): void {
    const record = chunk as ChunkRecord;
    if (record.lightTouch === 0) this.touched.push(record);
    const xs = lx === 0 ? -1 : lx === CHUNK_MASK ? 1 : 0;
    const ys = ly === 0 ? -1 : ly === CHUNK_MASK ? 1 : 0;
    const zs = lz === 0 ? -1 : lz === CHUNK_MASK ? 1 : 0;
    let mask = record.lightTouch | (1 << 13);
    if (xs | ys | zs) {
      for (let dz = 0; dz <= (zs ? 1 : 0); dz++) {
        for (let dy = 0; dy <= (ys ? 1 : 0); dy++) {
          for (let dx = 0; dx <= (xs ? 1 : 0); dx++) mask |= 1 << neighborIndex(dx * xs, dy * ys, dz * zs);
        }
      }
    }
    record.lightTouch = mask;
  }

  /** Requests remeshes for every chunk whose padded light volume changed. */
  private flushLightChanges(): void {
    for (const record of this.touched) {
      const mask = record.lightTouch;
      record.lightTouch = 0;
      for (let bit = 0; bit < 27; bit++) {
        if (!(mask & (1 << bit))) continue;
        const dx = (bit % 3) - 1, dy = (Math.floor(bit / 3) % 3) - 1, dz = Math.floor(bit / 9) - 1;
        const n = bit === 13 ? record : this.chunks.get(chunkKey(record.cx + dx, record.cy + dy, record.cz + dz));
        if (n && this.chunks.get(n.key) === n && n.state === 'ready' && n.lit && n.data && n.data.nonAirCount > 0) this.requestMesh(n);
      }
    }
    this.touched.length = 0;
  }

  /** Chunks generated but not yet lit. */
  get lightQueueSize(): number {
    return this.lightQueue.length - this.lightQueueHead;
  }

  /**
   * Runs the initial lighting of queued chunks (oldest first) until the queue is empty or
   * `budgetMs` has elapsed. Returns the number of chunks lit.
   */
  processLighting(budgetMs = Infinity, now: () => number = () => performance.now()): number {
    const start = budgetMs === Infinity ? 0 : now();
    let lit = 0;
    while (this.lightQueueHead < this.lightQueue.length) {
      const record = this.lightQueue[this.lightQueueHead++]!;
      if (this.chunks.get(record.key) !== record || record.state !== 'ready' || record.lit || !record.data) continue;
      this.light.lightChunk(record);
      lit++;
      if (budgetMs !== Infinity && now() - start >= budgetMs) break;
    }
    if (this.lightQueueHead === this.lightQueue.length) {
      this.lightQueue.length = 0;
      this.lightQueueHead = 0;
    }
    this.flushLightChanges();
    return lit;
  }

  get center(): { x: number; y: number; z: number } {
    return { x: this.centerX, y: this.centerY, z: this.centerZ };
  }

  getChunk(cx: number, cy: number, cz: number): ChunkRecord | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  /** Whether a chunk coordinate lies inside the streaming region around the current centre. */
  isDesired(cx: number, cy: number, cz: number): boolean {
    if (cy < this.config.minChunkY || cy > this.config.maxChunkY) return false;
    const dx = cx - this.centerX, dz = cz - this.centerZ;
    return dx * dx + dz * dz <= this.config.radius * this.config.radius;
  }

  /**
   * Re-centres streaming on the camera's chunk. Unloads chunks beyond radius + margin and
   * queues newly covered chunks. Returns the records that were unloaded.
   */
  updateCenter(cx: number, cy: number, cz: number): ChunkRecord[] {
    const moved = cx !== this.centerX || cz !== this.centerZ;
    if (cy !== this.centerY) this.pendingDirty = true;
    this.centerY = cy;
    if (!moved) return [];
    this.centerX = cx;
    this.centerZ = cz;
    this.pendingDirty = true;

    const unloaded: ChunkRecord[] = [];
    const limit = this.config.radius + this.config.unloadMargin;
    for (const record of this.chunks.values()) {
      const dx = record.cx - cx, dz = record.cz - cz;
      if (dx * dx + dz * dz > limit * limit) unloaded.push(record);
    }
    for (const record of unloaded) this.unload(record);

    const r = Math.ceil(this.config.radius);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > this.config.radius * this.config.radius) continue;
        for (let y = this.config.minChunkY; y <= this.config.maxChunkY; y++) {
          const key = chunkKey(cx + dx, y, cz + dz);
          if (this.chunks.has(key)) continue;
          this.chunks.set(key, createRecord(key, cx + dx, y, cz + dz));
        }
      }
    }
    return unloaded;
  }

  private unload(record: ChunkRecord): void {
    if (record.voxelSlot >= 0) this.voxelSlots.free(record.voxelSlot);
    if (record.meshSlot >= 0) this.meshSlots.free(record.meshSlot);
    record.voxelSlot = -1;
    record.meshSlot = -1;
    record.hasMesh = false;
    record.data = null;
    this.meshQueue.delete(record);
    this.uploadQueue.delete(record);
    this.chunks.delete(record.key);
  }

  private priority(record: ChunkRecord): number {
    const dx = record.cx - this.centerX, dy = record.cy - this.centerY, dz = record.cz - this.centerZ;
    return dx * dx + dz * dz + dy * dy * 0.5;
  }

  /**
   * Generation order: nearest columns first and, within a column, top down, so that every chunk
   * is lit after the chunk above it (sunlight then enters as straight columns instead of being
   * flooded in later).
   */
  private generationPriority(record: ChunkRecord): number {
    const dx = record.cx - this.centerX, dz = record.cz - this.centerZ;
    return (dx * dx + dz * dz) * 64 + (this.config.maxChunkY - record.cy);
  }

  /** Takes up to `max` pending chunks (nearest first) and assigns voxel slots to them. */
  nextGenerationBatch(max: number): GenerationJob[] {
    if (this.pendingDirty) {
      this.pendingSorted = [...this.chunks.values()].filter((r) => r.state === 'pending');
      this.pendingSorted.sort((a, b) => this.generationPriority(b) - this.generationPriority(a));
      this.pendingDirty = false;
    }
    const jobs: GenerationJob[] = [];
    while (jobs.length < max && this.pendingSorted.length > 0) {
      const record = this.pendingSorted[this.pendingSorted.length - 1]!;
      if (this.chunks.get(record.key) !== record || record.state !== 'pending') {
        this.pendingSorted.pop();
        continue;
      }
      const slot = this.voxelSlots.alloc();
      if (slot < 0) break;
      this.pendingSorted.pop();
      record.state = 'generating';
      record.voxelSlot = slot;
      record.genToken++;
      jobs.push({ record, token: record.genToken, voxelSlot: slot });
    }
    return jobs;
  }

  get pendingCount(): number {
    let n = 0;
    for (const r of this.chunks.values()) if (r.state === 'pending') n++;
    return n;
  }

  /**
   * Accepts the CPU copy of a generated chunk. Returns false if the job is stale
   * (chunk unloaded or regenerated in the meantime).
   */
  completeGeneration(job: GenerationJob, data: PalettedChunk): boolean {
    const record = job.record;
    if (this.chunks.get(record.key) !== record || record.state !== 'generating' || record.genToken !== job.token) {
      return false;
    }
    record.state = 'ready';
    record.data = data;
    const edits = this.edits?.editsFor(record.cx, record.cy, record.cz);
    if (edits && edits.size > 0) {
      for (const [index, block] of edits) data.set(index, block);
      // The GPU slot still holds the generated voxels.
      record.uploadPending = true;
      this.uploadQueue.add(record);
    }
    this.lightQueue.push(record);
    const empty = data.uniformBlock() === BlockType.Air;
    if (empty) {
      // Neighbours already treat missing data as air, so an empty chunk changes nothing.
      this.voxelSlots.free(record.voxelSlot);
      record.voxelSlot = -1;
      this.uploadQueue.delete(record);
      return true;
    }
    this.requestMesh(record);
    this.forEachNeighbor(record, (n) => {
      if (n.state === 'ready' && n.data && n.data.nonAirCount > 0) this.requestMesh(n);
    });
    return true;
  }

  private requestMesh(record: ChunkRecord): void {
    record.needsMesh = true;
    this.meshQueue.add(record);
  }

  private forEachNeighbor(record: ChunkRecord, fn: (n: ChunkRecord) => void): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const n = this.chunks.get(chunkKey(record.cx + dx, record.cy + dy, record.cz + dz));
          if (n) fn(n);
        }
      }
    }
  }

  /** True when every neighbour that will ever be generated at this centre already is. */
  private neighborsSettled(record: ChunkRecord): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = record.cx + dx, cy = record.cy + dy, cz = record.cz + dz;
          const n = this.chunks.get(chunkKey(cx, cy, cz));
          if (n) {
            if (n.state !== 'ready' || !n.lit) return false;
          } else if (this.isDesired(cx, cy, cz)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /** Takes up to `max` chunks needing a (re)mesh whose neighbourhood is fully generated. */
  nextMeshBatch(max: number): MeshJob[] {
    if (this.meshQueue.size === 0) return [];
    const candidates = [...this.meshQueue].filter((r) => r.state === 'ready' && this.neighborsSettled(r));
    candidates.sort((a, b) => this.priority(a) - this.priority(b));
    const jobs: MeshJob[] = [];
    for (const record of candidates) {
      if (jobs.length >= max) break;
      if (record.meshSlot < 0) {
        const slot = this.meshSlots.alloc();
        if (slot < 0) break;
        record.meshSlot = slot;
        record.hasMesh = false;
      }
      record.needsMesh = false;
      this.meshQueue.delete(record);
      record.meshVersion++;
      record.hasMesh = true;
      record.opaqueQuads = -1;
      record.waterQuads = -1;
      record.cutoutQuads = -1;
      jobs.push({
        record, version: record.meshVersion, meshSlot: record.meshSlot,
        neighborSlots: this.neighborSlots(record), neighborLight: this.neighborLight(record),
      });
    }
    return jobs;
  }

  get meshQueueSize(): number {
    return this.meshQueue.size;
  }

  neighborSlots(record: ChunkRecord, out = new Uint32Array(27)): Uint32Array {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = dx === 0 && dy === 0 && dz === 0
            ? record
            : this.chunks.get(chunkKey(record.cx + dx, record.cy + dy, record.cz + dz));
          const slot = n && n.state === 'ready' ? n.voxelSlot : -1;
          out[neighborIndex(dx, dy, dz)] = slot >= 0 ? slot : NO_SLOT;
        }
      }
    }
    return out;
  }

  /** Light of the chunk and its 26 neighbours in `neighborIndex` order (null = not lit). */
  neighborLight(record: ChunkRecord): (ChunkLight | null)[] {
    const out: (ChunkLight | null)[] = new Array(27);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = dx === 0 && dy === 0 && dz === 0
            ? record
            : this.chunks.get(chunkKey(record.cx + dx, record.cy + dy, record.cz + dz));
          out[neighborIndex(dx, dy, dz)] = n && n.lit && n.state === 'ready' ? n.light : null;
        }
      }
    }
    return out;
  }

  /**
   * Records the GPU-reported quad counts of a mesh job. Chunks that produced no geometry
   * give their mesh slot back. Returns false for stale results.
   */
  completeMesh(job: MeshJob, opaqueQuads: number, waterQuads: number, cutoutQuads = 0): boolean {
    const record = job.record;
    if (this.chunks.get(record.key) !== record || record.meshVersion !== job.version || record.meshSlot !== job.meshSlot) {
      return false;
    }
    record.opaqueQuads = opaqueQuads;
    record.waterQuads = waterQuads;
    record.cutoutQuads = cutoutQuads;
    if (opaqueQuads === 0 && waterQuads === 0 && cutoutQuads === 0) {
      this.meshSlots.free(record.meshSlot);
      record.meshSlot = -1;
      record.hasMesh = false;
    }
    return true;
  }

  // ------------------------------------------------------------------ voxel access / edits

  /** Light byte (sky << 4 | block) at a world voxel; open sky where nothing is lit. */
  getLight(wx: number, wy: number, wz: number): number {
    const record = this.getChunk(worldToChunk(wx), worldToChunk(wy), worldToChunk(wz));
    if (!record || !record.lit) return 0xf0;
    return record.light.get(localIndex(wx & CHUNK_MASK, wy & CHUNK_MASK, wz & CHUNK_MASK));
  }

  /** Block at a world voxel, or -1 if the owning chunk is not loaded/generated. */
  getBlock(wx: number, wy: number, wz: number): number {
    const record = this.getChunk(worldToChunk(wx), worldToChunk(wy), worldToChunk(wz));
    if (!record || record.state !== 'ready' || !record.data) return -1;
    return record.data.get(localIndex(wx & CHUNK_MASK, wy & CHUNK_MASK, wz & CHUNK_MASK));
  }

  /**
   * Edits one voxel. Marks the chunk for re-upload and re-meshing, plus every neighbour whose
   * border faces or ambient occlusion can observe the voxel. Returns false if not editable.
   */
  setBlock(wx: number, wy: number, wz: number, block: number): boolean {
    const cx = worldToChunk(wx), cy = worldToChunk(wy), cz = worldToChunk(wz);
    const record = this.getChunk(cx, cy, cz);
    if (!record || record.state !== 'ready' || !record.data) return false;
    const lx = wx & CHUNK_MASK, ly = wy & CHUNK_MASK, lz = wz & CHUNK_MASK;
    const index = localIndex(lx, ly, lz);
    const previous = record.data.get(index);
    if (previous === block) return false;
    if (record.voxelSlot < 0) {
      const slot = this.voxelSlots.alloc();
      if (slot < 0) return false;
      record.voxelSlot = slot;
    }
    record.data.set(index, block);
    this.light.blockChanged(record, index, previous);
    this.flushLightChanges();
    if (record.data.uniformBlock() === BlockType.Air) {
      this.voxelSlots.free(record.voxelSlot);
      record.voxelSlot = -1;
      this.uploadQueue.delete(record);
    } else {
      record.uploadPending = true;
      this.uploadQueue.add(record);
    }
    this.requestMesh(record);
    const xs = lx === 0 ? [-1, 0] : lx === CHUNK_MASK ? [0, 1] : [0];
    const ys = ly === 0 ? [-1, 0] : ly === CHUNK_MASK ? [0, 1] : [0];
    const zs = lz === 0 ? [-1, 0] : lz === CHUNK_MASK ? [0, 1] : [0];
    for (const dz of zs) {
      for (const dy of ys) {
        for (const dx of xs) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const n = this.getChunk(cx + dx, cy + dy, cz + dz);
          if (n && n.state === 'ready' && n.data && n.data.nonAirCount > 0) this.requestMesh(n);
        }
      }
    }
    return true;
  }

  /** Chunks whose CPU data must be re-uploaded; clears the queue. */
  takeUploads(): ChunkRecord[] {
    const list = [...this.uploadQueue].filter((r) => r.voxelSlot >= 0 && r.data);
    for (const r of list) r.uploadPending = false;
    this.uploadQueue.clear();
    return list;
  }

  // ------------------------------------------------------------------ stats

  /** Records that currently own renderable geometry. */
  *drawable(): IterableIterator<ChunkRecord> {
    for (const r of this.chunks.values()) if (r.meshSlot >= 0 && r.hasMesh) yield r;
  }

  countByState(): Record<ChunkState, number> {
    const counts: Record<ChunkState, number> = { pending: 0, generating: 0, ready: 0 };
    for (const r of this.chunks.values()) counts[r.state]++;
    return counts;
  }
}

function createRecord(key: number, cx: number, cy: number, cz: number): ChunkRecord {
  return {
    key, cx, cy, cz,
    state: 'pending',
    data: null,
    voxelSlot: -1,
    meshSlot: -1,
    needsMesh: false,
    hasMesh: false,
    meshVersion: 0,
    genToken: 0,
    opaqueQuads: -1,
    waterQuads: -1,
    cutoutQuads: -1,
    uploadPending: false,
    light: new ChunkLight(0),
    lit: false,
    lightTouch: 0,
  };
}
