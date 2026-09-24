import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/block';
import { ChunkManager, type GenerationJob } from '../src/world/chunk-manager';
import { SELF_NEIGHBOR_INDEX, chunkKey, neighborIndex } from '../src/world/coords';
import { NO_SLOT } from '../src/world/mesh-format';
import { PalettedChunk } from '../src/world/palette-chunk';

const SOLID = () => new PalettedChunk(BlockType.Stone);
const AIR = () => new PalettedChunk(BlockType.Air);

function manager(radius = 1, extra: Partial<ConstructorParameters<typeof ChunkManager>[0]> = {}): ChunkManager {
  return new ChunkManager({ radius, minChunkY: 0, maxChunkY: 0, voxelSlots: 64, meshSlots: 64, unloadMargin: 0.5, ...extra });
}

/** Generates everything that is pending, using `make` to decide chunk contents. */
function generateAll(m: ChunkManager, make: (job: GenerationJob) => PalettedChunk = SOLID): GenerationJob[] {
  const all: GenerationJob[] = [];
  for (let jobs = m.nextGenerationBatch(100); jobs.length > 0; jobs = m.nextGenerationBatch(100)) {
    for (const job of jobs) expect(m.completeGeneration(job, make(job))).toBe(true);
    all.push(...jobs);
  }
  m.processLighting();
  return all;
}

describe('ChunkManager streaming', () => {
  it('queues the chunks inside the streaming cylinder', () => {
    const m = manager(2, { minChunkY: -1, maxChunkY: 1 });
    m.updateCenter(0, 0, 0);
    // Radius 2 disc: 13 columns × 3 layers.
    expect(m.chunks.size).toBe(13 * 3);
    expect(m.pendingCount).toBe(39);
    expect(m.isDesired(2, 0, 0)).toBe(true);
    expect(m.isDesired(2, 0, 1)).toBe(false);
    expect(m.isDesired(0, 2, 0)).toBe(false);
  });

  it('hands out generation work nearest-first with voxel slots', () => {
    const m = manager(3);
    m.updateCenter(0, 0, 0);
    const jobs = m.nextGenerationBatch(5);
    expect(jobs).toHaveLength(5);
    expect(jobs[0]!.record.cx).toBe(0);
    expect(jobs[0]!.record.cz).toBe(0);
    const d = jobs.map((j) => j.record.cx ** 2 + j.record.cz ** 2);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(new Set(jobs.map((j) => j.voxelSlot)).size).toBe(5);
    expect(jobs.every((j) => j.record.state === 'generating')).toBe(true);
    expect(m.voxelSlots.used).toBe(5);
  });

  it('stops handing out work when voxel slots run out', () => {
    const m = manager(3, { voxelSlots: 4 });
    m.updateCenter(0, 0, 0);
    expect(m.nextGenerationBatch(10)).toHaveLength(4);
    expect(m.nextGenerationBatch(10)).toHaveLength(0);
  });

  it('releases voxel slots of empty chunks and never meshes them', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    generateAll(m, AIR);
    expect(m.voxelSlots.used).toBe(0);
    expect(m.nextMeshBatch(100)).toHaveLength(0);
    expect(m.countByState().ready).toBe(5);
  });

  it('waits for all generated neighbours before meshing', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    const [center] = m.nextGenerationBatch(1);
    m.completeGeneration(center!, SOLID());
    m.processLighting();
    expect(m.nextMeshBatch(10)).toHaveLength(0); // neighbours still pending
    generateAll(m);
    const jobs = m.nextMeshBatch(10);
    expect(jobs).toHaveLength(5);
    expect(jobs[0]!.record.cx).toBe(0);
    expect(jobs[0]!.record.cz).toBe(0);
  });

  it('builds the 27-neighbour voxel slot table (NO_SLOT for missing / empty)', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    generateAll(m, (job) => (job.record.cx === 1 ? AIR() : SOLID()));
    const job = m.nextMeshBatch(10).find((j) => j.record.cx === 0 && j.record.cz === 0)!;
    const self = m.getChunk(0, 0, 0)!;
    expect(job.neighborSlots[SELF_NEIGHBOR_INDEX]).toBe(self.voxelSlot);
    expect(job.neighborSlots[neighborIndex(-1, 0, 0)]).toBe(m.getChunk(-1, 0, 0)!.voxelSlot);
    expect(job.neighborSlots[neighborIndex(1, 0, 0)]).toBe(NO_SLOT); // empty chunk
    expect(job.neighborSlots[neighborIndex(0, 1, 0)]).toBe(NO_SLOT); // outside vertical range
    expect(job.neighborSlots[neighborIndex(1, 0, 1)]).toBe(NO_SLOT); // outside radius
  });

  it('re-meshes loaded neighbours when a chunk arrives later', () => {
    const m = manager(2);
    m.updateCenter(0, 0, 0);
    generateAll(m);
    for (const job of m.nextMeshBatch(100)) m.completeMesh(job, 10, 0);
    expect(m.meshQueueSize).toBe(0);
    // Move so a new column appears next to existing chunks.
    m.updateCenter(1, 0, 0);
    generateAll(m);
    const remeshed = m.nextMeshBatch(100).map((j) => `${j.record.cx},${j.record.cz}`);
    expect(remeshed).toContain('2,0'); // existing chunk adjacent to the new column (3,0)
    expect(remeshed).toContain('3,0');
  });

  it('frees mesh slots of chunks without geometry and ignores stale results', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    generateAll(m);
    const jobs = m.nextMeshBatch(100);
    expect(m.meshSlots.used).toBe(5);
    const [first, second] = jobs;
    expect(m.completeMesh(first!, 0, 0)).toBe(true);
    expect(first!.record.meshSlot).toBe(-1);
    expect(m.meshSlots.used).toBe(4);
    // A newer mesh job supersedes the older result.
    m.setBlock(second!.record.cx * 32 + 5, 5, second!.record.cz * 32 + 5, BlockType.Air);
    const newer = m.nextMeshBatch(100).find((j) => j.record === second!.record)!;
    expect(m.completeMesh(second!, 3, 0)).toBe(false);
    expect(m.completeMesh(newer, 7, 1)).toBe(true);
    expect(second!.record.opaqueQuads).toBe(7);
    expect(second!.record.waterQuads).toBe(1);
  });

  it('unloads distant chunks and frees their slots', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    generateAll(m);
    for (const job of m.nextMeshBatch(100)) m.completeMesh(job, 1, 0);
    const voxelBefore = m.voxelSlots.used;
    const unloaded = m.updateCenter(5, 0, 0);
    expect(unloaded).toHaveLength(5);
    expect(m.getChunk(0, 0, 0)).toBeUndefined();
    expect(m.voxelSlots.used).toBe(voxelBefore - 5);
    expect(m.meshSlots.used).toBe(0);
  });

  it('ignores generation results for chunks unloaded while in flight', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    const jobs = m.nextGenerationBatch(100);
    m.updateCenter(10, 0, 10);
    for (const job of jobs) expect(m.completeGeneration(job, SOLID())).toBe(false);
    expect(m.voxelSlots.used).toBe(0);
    expect(m.chunks.has(chunkKey(0, 0, 0))).toBe(false);
  });
});

describe('ChunkManager voxel edits', () => {
  function readyWorld(): ChunkManager {
    const m = manager(2);
    m.updateCenter(0, 0, 0);
    generateAll(m);
    for (const job of m.nextMeshBatch(100)) m.completeMesh(job, 1, 0);
    return m;
  }

  it('reads and writes world voxels across chunk boundaries', () => {
    const m = readyWorld();
    expect(m.getBlock(-1, 3, 40)).toBe(BlockType.Stone);
    expect(m.setBlock(-1, 3, 40, BlockType.Sand)).toBe(true);
    expect(m.getBlock(-1, 3, 40)).toBe(BlockType.Sand);
    expect(m.getChunk(-1, 0, 1)!.data!.getLocal(31, 3, 8)).toBe(BlockType.Sand);
    expect(m.setBlock(-1, 3, 40, BlockType.Sand)).toBe(false);
    expect(m.getBlock(0, 200, 0)).toBe(-1); // not loaded
  });

  it('queues an upload and re-meshes only the affected chunks', () => {
    const m = readyWorld();
    m.setBlock(10, 10, 10, BlockType.Air); // interior voxel
    expect(m.takeUploads().map((r) => r.key)).toEqual([chunkKey(0, 0, 0)]);
    expect(m.nextMeshBatch(100).map((j) => j.record.key)).toEqual([chunkKey(0, 0, 0)]);

    m.setBlock(31, 0, 0, BlockType.Air); // corner voxel: touches +X, -Z and diagonal neighbours
    const keys = new Set(m.nextMeshBatch(100).map((j) => `${j.record.cx},${j.record.cz}`));
    expect(keys).toEqual(new Set(['0,0', '1,0', '0,-1', '1,-1']));
  });

  it('allocates a voxel slot when building into an empty chunk and frees it when emptied', () => {
    const m = manager(1);
    m.updateCenter(0, 0, 0);
    generateAll(m, AIR);
    expect(m.voxelSlots.used).toBe(0);
    expect(m.setBlock(4, 4, 4, BlockType.Basalt)).toBe(true);
    const record = m.getChunk(0, 0, 0)!;
    expect(record.voxelSlot).toBeGreaterThanOrEqual(0);
    expect(m.takeUploads()).toEqual([record]);
    expect(m.setBlock(4, 4, 4, BlockType.Air)).toBe(true);
    expect(record.voxelSlot).toBe(-1);
    expect(m.voxelSlots.used).toBe(0);
    expect(m.takeUploads()).toEqual([]);
  });
});
