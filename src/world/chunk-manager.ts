import { BlockType } from './block';
import {
  CHUNK_MASK,
  chunkKey,
  localIndex,
  neighborIndex,
  worldToChunk,
} from './coords';
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
  /** CPU voxel data changed and must be re-uploaded to the GPU slot. */
  uploadPending: boolean;
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
}

/**
 * CPU-side bookkeeping for chunk streaming. Pure logic (no GPU calls) so it can be unit tested:
 *  - keeps the set of chunks within the streaming cylinder around the camera,
 *  - hands out generation and meshing work in nearest-first order,
 *  - owns voxel/mesh slot allocation and neighbour invalidation.
 */
export class ChunkManager {
  readonly chunks = new Map<number, ChunkRecord>();
  readonly voxelSlots: SlotAllocator;
  readonly meshSlots: SlotAllocator;
  readonly config: StreamingConfig;
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

  /** Takes up to `max` pending chunks (nearest first) and assigns voxel slots to them. */
  nextGenerationBatch(max: number): GenerationJob[] {
    if (this.pendingDirty) {
      this.pendingSorted = [...this.chunks.values()].filter((r) => r.state === 'pending');
      this.pendingSorted.sort((a, b) => this.priority(b) - this.priority(a));
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
    const empty = data.uniformBlock() === BlockType.Air;
    if (empty) {
      // Neighbours already treat missing data as air, so an empty chunk changes nothing.
      this.voxelSlots.free(record.voxelSlot);
      record.voxelSlot = -1;
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
            if (n.state !== 'ready') return false;
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
      jobs.push({ record, version: record.meshVersion, meshSlot: record.meshSlot, neighborSlots: this.neighborSlots(record) });
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

  /**
   * Records the GPU-reported quad counts of a mesh job. Chunks that produced no geometry
   * give their mesh slot back. Returns false for stale results.
   */
  completeMesh(job: MeshJob, opaqueQuads: number, waterQuads: number): boolean {
    const record = job.record;
    if (this.chunks.get(record.key) !== record || record.meshVersion !== job.version || record.meshSlot !== job.meshSlot) {
      return false;
    }
    record.opaqueQuads = opaqueQuads;
    record.waterQuads = waterQuads;
    if (opaqueQuads === 0 && waterQuads === 0) {
      this.meshSlots.free(record.meshSlot);
      record.meshSlot = -1;
      record.hasMesh = false;
    }
    return true;
  }

  // ------------------------------------------------------------------ voxel access / edits

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
    uploadPending: false,
  };
}
