import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/block';
import { ChunkManager } from '../src/world/chunk-manager';
import { CHUNK_VOLUME, localIndex } from '../src/world/coords';
import { PalettedChunk } from '../src/world/palette-chunk';
import { WorldDelta, chunkId, decodeChunkEdits, encodeChunkEdits, parseChunkId } from '../src/storage/delta';
import { MemoryStore, WorldStore, type PlayerSave } from '../src/storage/world-store';
import { mulberry32 } from './helpers';

const player: PlayerSave = {
  position: [12.5, 40, -3.25], yaw: 1.2, pitch: -0.3, mode: 'walk', timeOfDay: 0.4,
  hotbar: { selected: 7, counts: [64, 63, 0, 12, 5, 64, 64, 30, 16] },
};

describe('chunk edit serialization', () => {
  it('round-trips sparse edits in a compact binary record', () => {
    const edits = new Map<number, number>([[0, BlockType.Air], [CHUNK_VOLUME - 1, BlockType.Torch], [1234, BlockType.WaterFlow3]]);
    const bytes = encodeChunkEdits(edits);
    expect(bytes.byteLength).toBe(8 + 3 * 3);
    expect(decodeChunkEdits(bytes)).toEqual(edits);
  });

  it('round-trips thousands of random edits and an empty record', () => {
    const rand = mulberry32(7);
    const edits = new Map<number, number>();
    for (let i = 0; i < 5000; i++) edits.set(Math.floor(rand() * CHUNK_VOLUME), Math.floor(rand() * 32));
    expect(decodeChunkEdits(encodeChunkEdits(edits))).toEqual(edits);
    expect(decodeChunkEdits(encodeChunkEdits(new Map())).size).toBe(0);
  });

  it('rejects corrupt or truncated records', () => {
    const bytes = encodeChunkEdits(new Map([[5, 1]]));
    expect(() => decodeChunkEdits(bytes.slice(0, bytes.length - 1))).toThrow();
    const bad = bytes.slice();
    bad[0] = 0;
    expect(() => decodeChunkEdits(bad)).toThrow();
    const future = bytes.slice();
    future[2] = 9;
    expect(() => decodeChunkEdits(future)).toThrow(/version/);
  });

  it('parses chunk ids', () => {
    expect(parseChunkId(chunkId(-3, 0, 17))).toEqual([-3, 0, 17]);
    expect(parseChunkId('1,2')).toBeNull();
  });
});

describe('WorldDelta', () => {
  it('groups edits by chunk, keeps the latest block and tracks dirty chunks', () => {
    const d = new WorldDelta();
    d.record(1, 2, 3, BlockType.Stone);
    d.record(1, 2, 3, BlockType.Brick);
    d.record(-1, 2, 3, BlockType.Air);
    d.record(40, -70, 3, BlockType.Torch);
    expect(d.chunkCount).toBe(3);
    expect(d.editCount).toBe(3);
    expect(d.editsFor(0, 0, 0)!.get(localIndex(1, 2, 3))).toBe(BlockType.Brick);
    expect(d.editsFor(-1, 0, 0)!.get(localIndex(31, 2, 3))).toBe(BlockType.Air);
    expect(d.editsFor(1, -3, 0)!.get(localIndex(8, 26, 3))).toBe(BlockType.Torch);
    expect(d.takeDirty().map(([id]) => id).sort()).toEqual(['-1,0,0', '0,0,0', '1,-3,0']);
    expect(d.dirtyCount).toBe(0);
    d.record(2, 2, 3, BlockType.Sand);
    expect(d.takeDirty().map(([id]) => id)).toEqual(['0,0,0']);
  });
});

describe('WorldStore', () => {
  it('saves only dirty chunks and loads everything back', async () => {
    const kv = new MemoryStore();
    const store = new WorldStore(kv, 1337);
    const d = new WorldDelta();
    d.record(5, 5, 5, BlockType.Glass);
    d.record(100, 5, 5, BlockType.Torch);
    expect(await store.save(d, player)).toBe(2);
    expect(await store.save(d, player)).toBe(0);
    d.record(6, 5, 5, BlockType.Water);
    expect(await store.save(d, null)).toBe(1);

    const loaded = await new WorldStore(kv, 1337).load();
    expect(loaded.delta.editCount).toBe(3);
    expect(loaded.delta.editsFor(0, 0, 0)!.get(localIndex(6, 5, 5))).toBe(BlockType.Water);
    expect(loaded.delta.editsFor(3, 0, 0)!.get(localIndex(4, 5, 5))).toBe(BlockType.Torch);
    expect(loaded.delta.dirtyCount).toBe(0);
    expect(loaded.player).toEqual(player);
  });

  it('keeps worlds of different seeds apart and resets the whole database', async () => {
    const kv = new MemoryStore();
    const a = new WorldStore(kv, 1), b = new WorldStore(kv, 2);
    const d = new WorldDelta();
    d.record(0, 0, 0, BlockType.Brick);
    await a.save(d, player);
    expect((await b.load()).delta.editCount).toBe(0);
    expect((await b.load()).player).toBeNull();
    expect((await a.load()).delta.editCount).toBe(1);
    await a.reset();
    expect(kv.data.size).toBe(0);
    expect((await a.load()).delta.editCount).toBe(0);
  });

  it('skips corrupt records and invalid player saves', async () => {
    const kv = new MemoryStore();
    await kv.putMany([['w5/c/0,0,0', new Uint8Array([1, 2, 3])], ['w5/c/nonsense', new Uint8Array()], ['w5/player', { position: [1, 2] }]]);
    const loaded = await new WorldStore(kv, 5).load();
    expect(loaded.delta.chunkCount).toBe(0);
    expect(loaded.player).toBeNull();
  });

  it('re-marks chunks dirty when a save fails', async () => {
    const kv = new MemoryStore();
    kv.putMany = async () => { throw new Error('quota exceeded'); };
    const store = new WorldStore(kv, 1);
    const d = new WorldDelta();
    d.record(0, 0, 0, BlockType.Brick);
    await expect(store.save(d, null)).rejects.toThrow('quota');
    expect(d.dirtyCount).toBe(1);
  });
});

describe('re-applying saved edits while streaming', () => {
  it('patches generated chunks, uploads them and relights them', () => {
    const m = new ChunkManager({ radius: 1, minChunkY: 0, maxChunkY: 0, voxelSlots: 16, meshSlots: 16 });
    const d = new WorldDelta();
    d.record(3, 20, 3, BlockType.Torch); // in an otherwise all-air chunk
    d.record(40, 1, 3, BlockType.Air); // a hole in a solid chunk
    m.edits = d;
    m.updateCenter(0, 0, 0);
    for (const job of m.nextGenerationBatch(16)) {
      m.completeGeneration(job, job.record.cx === 1 ? new PalettedChunk(BlockType.Stone) : new PalettedChunk(BlockType.Air));
    }
    m.processLighting();
    expect(m.getBlock(3, 20, 3)).toBe(BlockType.Torch);
    expect(m.getBlock(40, 1, 3)).toBe(BlockType.Air);
    expect(m.getBlock(41, 1, 3)).toBe(BlockType.Stone);
    // The all-air chunk keeps its voxel slot because it is no longer empty; both need an upload.
    expect(m.getChunk(0, 0, 0)!.voxelSlot).toBeGreaterThanOrEqual(0);
    expect(m.takeUploads().map((r) => `${r.cx},${r.cz}`).sort()).toEqual(['0,0', '1,0']);
    expect(m.getLight(3, 20, 3) & 15).toBe(14);
  });
});
