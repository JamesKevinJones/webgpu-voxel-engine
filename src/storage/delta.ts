import { CHUNK_MASK, CHUNK_VOLUME, localIndex, worldToChunk } from '../world/coords';
import type { ChunkEditSource } from '../world/chunk-manager';

/**
 * Sparse record of every voxel the player (or the water they released) changed, per chunk:
 * local voxel index → block id. Generated terrain is deterministic, so these diffs are all that
 * needs saving; they are re-applied whenever a chunk streams back in.
 */
export class WorldDelta implements ChunkEditSource {
  private readonly chunks = new Map<string, Map<number, number>>();
  private readonly dirty = new Set<string>();

  /** Records the final block of a voxel. */
  record(x: number, y: number, z: number, block: number): void {
    const key = chunkId(worldToChunk(x), worldToChunk(y), worldToChunk(z));
    let edits = this.chunks.get(key);
    if (!edits) {
      edits = new Map();
      this.chunks.set(key, edits);
    }
    edits.set(localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK), block);
    this.dirty.add(key);
  }

  editsFor(cx: number, cy: number, cz: number): ReadonlyMap<number, number> | undefined {
    return this.chunks.get(chunkId(cx, cy, cz));
  }

  /** Replaces the edits of one chunk (when loading from storage); not marked dirty. */
  load(id: string, edits: Map<number, number>): void {
    if (edits.size > 0) this.chunks.set(id, edits);
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  get editCount(): number {
    let n = 0;
    for (const e of this.chunks.values()) n += e.size;
    return n;
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  /** Chunks changed since the last call, with their encoded edits. */
  takeDirty(): [string, Uint8Array][] {
    const out: [string, Uint8Array][] = [];
    for (const id of this.dirty) out.push([id, encodeChunkEdits(this.chunks.get(id) ?? new Map())]);
    this.dirty.clear();
    return out;
  }

  /** Marks chunks dirty again (after a failed save). */
  markDirty(ids: Iterable<string>): void {
    for (const id of ids) this.dirty.add(id);
  }

  clear(): void {
    this.chunks.clear();
    this.dirty.clear();
  }
}

export function chunkId(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

export function parseChunkId(id: string): [number, number, number] | null {
  const m = /^(-?\d+),(-?\d+),(-?\d+)$/.exec(id);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Binary format version 1: "VD", version, reserved, u32 count, count × u16 index, count × u8 block. */
const MAGIC_0 = 0x56; // 'V'
const MAGIC_1 = 0x44; // 'D'
const VERSION = 1;
const HEADER_BYTES = 8;

export function encodeChunkEdits(edits: ReadonlyMap<number, number>): Uint8Array {
  const count = edits.size;
  const bytes = new Uint8Array(HEADER_BYTES + count * 3);
  const view = new DataView(bytes.buffer);
  bytes[0] = MAGIC_0;
  bytes[1] = MAGIC_1;
  bytes[2] = VERSION;
  view.setUint32(4, count, true);
  let i = 0;
  const sorted = [...edits.keys()].sort((a, b) => a - b);
  for (const index of sorted) {
    view.setUint16(HEADER_BYTES + i * 2, index, true);
    bytes[HEADER_BYTES + count * 2 + i] = edits.get(index)!;
    i++;
  }
  return bytes;
}

export function decodeChunkEdits(bytes: Uint8Array): Map<number, number> {
  if (bytes.length < HEADER_BYTES || bytes[0] !== MAGIC_0 || bytes[1] !== MAGIC_1) throw new Error('not a chunk edit record');
  if (bytes[2] !== VERSION) throw new Error(`unsupported chunk edit version ${bytes[2]}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  if (bytes.length !== HEADER_BYTES + count * 3) throw new Error('truncated chunk edit record');
  const edits = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const index = view.getUint16(HEADER_BYTES + i * 2, true);
    if (index >= CHUNK_VOLUME) throw new Error('voxel index out of range');
    edits.set(index, bytes[HEADER_BYTES + count * 2 + i]!);
  }
  return edits;
}
