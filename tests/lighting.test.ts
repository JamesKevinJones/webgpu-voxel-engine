import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/world/block';
import { ChunkManager } from '../src/world/chunk-manager';
import { CHUNK_MASK, CHUNK_SIZE, chunkKey, localIndex, neighborIndex, worldToChunk } from '../src/world/coords';
import {
  ChunkLight,
  FULL_SKY,
  LightEngine,
  blockLight,
  buildPaddedLight,
  skyLight,
  type LightChunk,
  type LightWorld,
} from '../src/world/lighting';
import { PADDED_SIZE, paddedIndex } from '../src/world/mesh-format';
import { PalettedChunk } from '../src/world/palette-chunk';

/** Minimal in-memory world: chunks keyed by coordinate, top layer at `maxChunkY`. */
class TestWorld implements LightWorld {
  readonly chunks = new Map<number, LightChunk>();
  readonly engine = new LightEngine(this);
  changed = 0;

  constructor(readonly maxChunkY = 0) {}

  chunkAt(cx: number, cy: number, cz: number): LightChunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }

  lightChanged(): void {
    this.changed++;
  }

  add(cx: number, cy: number, cz: number, fill: (x: number, y: number, z: number) => number, light = true): LightChunk {
    const data = new PalettedChunk();
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const b = fill(cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y, cz * CHUNK_SIZE + z);
          if (b !== BlockType.Air) data.set(localIndex(x, y, z), b);
        }
      }
    }
    const chunk: LightChunk = { cx, cy, cz, data, light: new ChunkLight(), lit: false };
    this.chunks.set(chunkKey(cx, cy, cz), chunk);
    if (light) this.engine.lightChunk(chunk);
    return chunk;
  }

  private locate(x: number, y: number, z: number): [LightChunk, number] {
    const c = this.chunkAt(worldToChunk(x), worldToChunk(y), worldToChunk(z));
    if (!c) throw new Error(`no chunk at ${x},${y},${z}`);
    return [c, localIndex(x & CHUNK_MASK, y & CHUNK_MASK, z & CHUNK_MASK)];
  }

  sky(x: number, y: number, z: number): number {
    const [c, i] = this.locate(x, y, z);
    return skyLight(c.light.get(i));
  }

  block(x: number, y: number, z: number): number {
    const [c, i] = this.locate(x, y, z);
    return blockLight(c.light.get(i));
  }

  set(x: number, y: number, z: number, block: number): void {
    const [c, i] = this.locate(x, y, z);
    const previous = c.data!.get(i);
    c.data!.set(i, block);
    this.engine.blockChanged(c, i, previous);
  }
}

const stoneBelow = (h: number) => (_x: number, y: number) => (y <= h ? BlockType.Stone : BlockType.Air);

describe('skylight', () => {
  it('lights open air with 15 straight down to the ground and nothing inside rock', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, stoneBelow(4));
    for (const [x, z] of [[0, 0], [15, 20], [31, 31]] as const) {
      for (let y = 5; y < CHUNK_SIZE; y++) expect(w.sky(x, y, z)).toBe(15);
      expect(w.sky(x, 4, z)).toBe(0);
      expect(w.sky(x, 0, z)).toBe(0);
    }
  });

  it('keeps an all-air chunk under open sky uniform (no per-voxel storage)', () => {
    const w = new TestWorld();
    const c = w.add(0, 0, 0, () => BlockType.Air);
    expect(c.light.data).toBeNull();
    expect(c.light.fill).toBe(FULL_SKY);
  });

  it('spreads sideways under an overhang losing one level per block', () => {
    const w = new TestWorld();
    // Ground at y <= 4, a stone roof at y = 10 covering x < 16 (all z).
    w.add(0, 0, 0, (x, y) => (y <= 4 || (y === 10 && x < 16) ? BlockType.Stone : BlockType.Air));
    expect(w.sky(16, 6, 8)).toBe(15);
    for (let d = 1; d <= 10; d++) expect(w.sky(16 - d, 6, 8)).toBe(15 - d);
    expect(w.sky(3, 6, 8)).toBe(2);
    expect(w.sky(1, 6, 8)).toBe(0);
    // Above the roof it is open sky again.
    expect(w.sky(3, 11, 8)).toBe(15);
  });

  it('dims by one level per block of water and two per block of leaves', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, (x, y) => {
      if (y === 0) return BlockType.Stone;
      if (x < 16) return y <= 8 ? BlockType.Water : BlockType.Air;
      // A 3-block leaf canopy at y 20..22 over x >= 16, open around it only far away.
      return y >= 20 && y <= 22 ? BlockType.Leaves : BlockType.Air;
    });
    expect(w.sky(4, 9, 4)).toBe(15);
    expect(w.sky(4, 8, 4)).toBe(14);
    expect(w.sky(4, 3, 4)).toBe(9);
    expect(w.sky(24, 22, 8)).toBe(13);
    expect(w.sky(24, 21, 8)).toBe(11);
  });

  it('flows from the chunk above into the chunk below, whichever is lit first', () => {
    for (const order of ['top-down', 'bottom-up'] as const) {
      const w = new TestWorld(1);
      const fill = stoneBelow(8);
      if (order === 'top-down') {
        w.add(0, 1, 0, fill);
        w.add(0, 0, 0, fill);
      } else {
        const lower = w.add(0, 0, 0, fill, false);
        w.add(0, 1, 0, fill, false);
        w.engine.lightChunk(lower);
        w.engine.lightChunk(w.chunkAt(0, 1, 0)!);
      }
      for (let y = 9; y < 64; y++) expect(w.sky(5, y, 5), `${order} y=${y}`).toBe(15);
      expect(w.sky(5, 8, 5)).toBe(0);
    }
  });

  it('darkens a column when a block is placed over it and relights it when removed', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, stoneBelow(4));
    w.set(10, 20, 10, BlockType.Stone);
    expect(w.sky(10, 21, 10)).toBe(15);
    expect(w.sky(10, 19, 10)).toBe(14);
    expect(w.sky(10, 5, 10)).toBe(14);
    expect(w.sky(11, 19, 10)).toBe(15);
    w.set(10, 20, 10, BlockType.Air);
    for (let y = 5; y < CHUNK_SIZE; y++) expect(w.sky(10, y, 10)).toBe(15);
  });

  it('seals a cave: sealing its opening removes all skylight inside', () => {
    const w = new TestWorld();
    // Solid rock up to y = 20 with a 5×5×5 cavity at y 8..12 and a shaft up to the surface.
    const cavity = (x: number, y: number, z: number) =>
      (x >= 8 && x <= 12 && y >= 8 && y <= 12 && z >= 8 && z <= 12) || (x === 10 && z === 10 && y > 12 && y <= 20);
    w.add(0, 0, 0, (x, y, z) => (y <= 20 && !cavity(x, y, z) ? BlockType.Stone : BlockType.Air));
    expect(w.sky(10, 15, 10)).toBe(15); // sunbeam down the shaft
    expect(w.sky(10, 8, 10)).toBe(15);
    expect(w.sky(8, 8, 8)).toBe(11);
    w.set(10, 20, 10, BlockType.Stone);
    for (let y = 8; y < 20; y++) expect(w.sky(10, y, 10)).toBe(0);
    expect(w.sky(8, 8, 8)).toBe(0);
  });
});

describe('block light (torches)', () => {
  it('emits 14 and decreases by one per step (Manhattan distance)', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, stoneBelow(4));
    w.set(16, 10, 16, BlockType.Torch);
    expect(w.block(16, 10, 16)).toBe(14);
    expect(w.block(17, 10, 16)).toBe(13);
    expect(w.block(16, 12, 16)).toBe(12);
    expect(w.block(19, 11, 18)).toBe(14 - 6);
    expect(w.block(16, 10, 30)).toBe(0);
    // Rock stays dark.
    expect(w.block(16, 4, 16)).toBe(0);
  });

  it('removes all block light when the torch is mined', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, stoneBelow(4));
    w.set(16, 10, 16, BlockType.Torch);
    w.set(16, 10, 16, BlockType.Air);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let y = 5; y < CHUNK_SIZE; y++) expect(w.block(x, y, 16)).toBe(0);
  });

  it('keeps the brighter of two torches when one is removed', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, stoneBelow(4));
    w.set(10, 10, 10, BlockType.Torch);
    w.set(14, 10, 10, BlockType.Torch);
    expect(w.block(12, 10, 10)).toBe(12);
    w.set(10, 10, 10, BlockType.Air);
    expect(w.block(12, 10, 10)).toBe(12);
    expect(w.block(10, 10, 10)).toBe(10);
    expect(w.block(6, 10, 10)).toBe(6);
  });

  it('is blocked by walls and flows around them', () => {
    const w = new TestWorld();
    // A wall at x = 12 from y 5..15, z 0..20 (open beyond z = 20).
    w.add(0, 0, 0, (x, y, z) => (y <= 4 || (x === 12 && y <= 15 && z <= 20) ? BlockType.Stone : BlockType.Air));
    w.set(10, 5, 10, BlockType.Torch);
    expect(w.block(11, 5, 10)).toBe(13);
    expect(w.block(12, 5, 10)).toBe(0);
    // Behind the wall light has to go over it (up 11, across 2, down 11): gone.
    expect(w.block(13, 5, 10)).toBe(0);
  });

  it('crosses chunk borders in every direction', () => {
    const w = new TestWorld(1);
    for (let cz = -1; cz <= 1; cz++) for (let cy = 1; cy >= 0; cy--) for (let cx = -1; cx <= 1; cx++) w.add(cx, cy, cz, stoneBelow(-100));
    w.set(1, 31, 1, BlockType.Torch);
    expect(w.block(1, 31, 1)).toBe(14);
    expect(w.block(-1, 31, 1)).toBe(12); // west chunk
    expect(w.block(1, 32, 1)).toBe(13); // chunk above
    expect(w.block(1, 31, -3)).toBe(10); // north chunk
    expect(w.block(-2, 33, -2)).toBe(14 - 3 - 2 - 3);
  });

  it('seeds from torches that already exist when a chunk is generated', () => {
    const w = new TestWorld();
    w.add(0, 0, 0, (x, y, z) => (y <= 4 ? BlockType.Stone : x === 3 && y === 5 && z === 3 ? BlockType.Torch : BlockType.Air));
    expect(w.block(3, 5, 3)).toBe(14);
    expect(w.block(3, 5, 6)).toBe(11);
  });
});

describe('padded light volume', () => {
  it('copies the chunk and a one-voxel border from its neighbours', () => {
    const lights: (ChunkLight | null)[] = new Array(27).fill(null);
    const centre = new ChunkLight(0);
    centre.set(localIndex(0, 5, 7), 0x3a);
    centre.set(localIndex(31, 5, 7), 0x21);
    lights[neighborIndex(0, 0, 0)] = centre;
    const west = new ChunkLight(0);
    west.set(localIndex(31, 5, 7), 0x77);
    lights[neighborIndex(-1, 0, 0)] = west;
    lights[neighborIndex(1, 0, 0)] = new ChunkLight(0x05);
    const out = buildPaddedLight(lights);
    expect(out[paddedIndex(1, 6, 8)]).toBe(0x3a);
    expect(out[paddedIndex(32, 6, 8)]).toBe(0x21);
    expect(out[paddedIndex(0, 6, 8)]).toBe(0x77);
    expect(out[paddedIndex(33, 6, 8)]).toBe(0x05);
    expect(out[paddedIndex(5, 5, 5)]).toBe(0);
    // Missing neighbours (above) read as open sky.
    expect(out[paddedIndex(5, PADDED_SIZE - 1, 5)]).toBe(FULL_SKY);
  });
});

describe('chunk manager lighting', () => {
  it('lights generated chunks, relights on edits and requests remeshes', () => {
    const m = new ChunkManager({ radius: 2, minChunkY: 0, maxChunkY: 0, voxelSlots: 64, meshSlots: 64 });
    m.updateCenter(0, 0, 0);
    const jobs = m.nextGenerationBatch(64);
    for (const job of jobs) {
      const data = new PalettedChunk();
      for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) for (let y = 0; y <= 4; y++) data.set(localIndex(x, y, z), BlockType.Stone);
      m.completeGeneration(job, data);
    }
    expect(m.lightQueueSize).toBe(jobs.length);
    expect(m.nextMeshBatch(64)).toHaveLength(0); // waits for light
    m.processLighting();
    expect(m.lightQueueSize).toBe(0);
    expect(skyLight(m.getLight(3, 10, 3))).toBe(15);
    const meshed = m.nextMeshBatch(64);
    expect(meshed.length).toBeGreaterThan(0);
    for (const job of meshed) m.completeMesh(job, 1, 0, 0);
    expect(m.meshQueueSize).toBe(0);

    // A torch on a chunk corner remeshes every chunk that can see its light.
    m.setBlock(31, 5, 31, BlockType.Torch);
    expect(blockLight(m.getLight(31, 5, 31))).toBe(14);
    expect(blockLight(m.getLight(32, 5, 32))).toBe(12);
    const remesh = m.nextMeshBatch(64).map((j) => `${j.record.cx},${j.record.cz}`).sort();
    expect(remesh).toEqual(['0,0', '0,1', '1,0', '1,1']);
    expect(remesh.length).toBeGreaterThan(0);
  });

  it('processes lighting within a time budget', () => {
    const m = new ChunkManager({ radius: 2, minChunkY: 0, maxChunkY: 0, voxelSlots: 64, meshSlots: 64 });
    m.updateCenter(0, 0, 0);
    for (const job of m.nextGenerationBatch(64)) m.completeGeneration(job, new PalettedChunk(BlockType.Stone));
    let t = 0;
    const lit = m.processLighting(5, () => (t += 10));
    expect(lit).toBe(1);
    expect(m.lightQueueSize).toBeGreaterThan(0);
  });
});
