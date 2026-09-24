import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE_COUNT, BlockType, MAX_GPU_PALETTE } from '../src/world/block';
import { CHUNK_VOLUME, localIndex } from '../src/world/coords';
import {
  GPU_DATA_OFFSET,
  GPU_DATA_WORDS,
  GPU_PALETTE_OFFSET,
  GPU_SLOT_WORDS,
  PalettedChunk,
  bitsForPaletteSize,
  dataWordsForBits,
} from '../src/world/palette-chunk';
import { generateChunkDense } from '../src/world/terrain';
import { mulberry32 } from './helpers';

describe('bit widths', () => {
  it('picks the smallest power-of-two index width', () => {
    expect([1, 2, 3, 4, 5, 16, 17, 256, 257, 65536].map(bitsForPaletteSize)).toEqual([0, 1, 2, 2, 4, 4, 8, 8, 16, 16]);
    expect(() => bitsForPaletteSize(65537)).toThrow(RangeError);
  });

  it('sizes packed storage so indices never straddle words', () => {
    for (const bits of [1, 2, 4, 8, 16]) {
      expect(32 % bits).toBe(0);
      expect(dataWordsForBits(bits)).toBe((CHUNK_VOLUME * bits) / 32);
    }
    expect(GPU_DATA_WORDS).toBe(8192);
    expect(GPU_SLOT_WORDS).toBe(4 + MAX_GPU_PALETTE + 8192);
  });
});

describe('PalettedChunk', () => {
  it('starts as a uniform chunk without packed data', () => {
    const c = new PalettedChunk();
    expect(c.bits).toBe(0);
    expect(c.rawData).toBeNull();
    expect(c.uniformBlock()).toBe(BlockType.Air);
    expect(c.nonAirCount).toBe(0);
    expect(c.get(12345)).toBe(BlockType.Air);
  });

  it('grows its index width as the palette grows', () => {
    const c = new PalettedChunk();
    c.set(0, BlockType.Stone);
    expect(c.bits).toBe(1);
    c.set(1, BlockType.Dirt);
    expect(c.bits).toBe(2);
    c.set(2, BlockType.Grass);
    expect(c.bits).toBe(2);
    c.set(3, BlockType.Sand);
    expect(c.bits).toBe(4);
    expect([0, 1, 2, 3, 4].map((i) => c.get(i))).toEqual([BlockType.Stone, BlockType.Dirt, BlockType.Grass, BlockType.Sand, BlockType.Air]);
    expect(c.nonAirCount).toBe(4);
  });

  it('matches a dense reference under random edits', () => {
    const rand = mulberry32(42);
    const c = new PalettedChunk();
    const ref = new Uint16Array(CHUNK_VOLUME);
    for (let n = 0; n < 50_000; n++) {
      const i = Math.floor(rand() * CHUNK_VOLUME);
      const b = Math.floor(rand() * BLOCK_TYPE_COUNT);
      const changed = c.set(i, b);
      expect(changed).toBe(ref[i] !== b);
      ref[i] = b;
    }
    expect(c.toDense()).toEqual(ref);
    for (let b = 0; b < BLOCK_TYPE_COUNT; b++) expect(c.countOf(b)).toBe(ref.filter((v) => v === b).length);
  });

  it('recycles unreferenced palette entries instead of growing', () => {
    const c = new PalettedChunk();
    for (let round = 0; round < 20; round++) {
      // Replace the only non-air block with a different type each round.
      c.set(100, 1 + (round % 6));
    }
    expect(c.paletteEntries.length).toBeLessThanOrEqual(2);
    expect(c.bits).toBe(1);
  });

  it('never needs more palette entries than distinct block types', () => {
    const rand = mulberry32(7);
    const c = new PalettedChunk();
    for (let n = 0; n < 20_000; n++) c.set(Math.floor(rand() * CHUNK_VOLUME), Math.floor(rand() * BLOCK_TYPE_COUNT));
    expect(c.paletteEntries.length).toBeLessThanOrEqual(BLOCK_TYPE_COUNT);
    expect(c.bits).toBeLessThanOrEqual(8);
  });

  it('compacts to the minimal width after blocks disappear', () => {
    const c = new PalettedChunk();
    for (let i = 0; i < 5; i++) c.set(i, 1 + i);
    expect(c.bits).toBe(4);
    for (let i = 1; i < 5; i++) c.set(i, BlockType.Air);
    c.compact();
    expect(c.bits).toBe(1);
    expect(c.get(0)).toBe(1);
    expect(c.get(1)).toBe(BlockType.Air);
    c.set(0, BlockType.Air);
    c.compact();
    expect(c.bits).toBe(0);
    expect(c.uniformBlock()).toBe(BlockType.Air);
  });

  it('supports wide palettes (8 and 16 bit indices)', () => {
    const values = new Uint16Array(CHUNK_VOLUME);
    for (let i = 0; i < CHUNK_VOLUME; i++) values[i] = i % 200;
    const c8 = PalettedChunk.fromDense(values);
    expect(c8.bits).toBe(8);
    expect(c8.toDense()).toEqual(values);
    for (let i = 0; i < CHUNK_VOLUME; i++) values[i] = (i * 7) % 1000;
    const c16 = PalettedChunk.fromDense(values);
    expect(c16.bits).toBe(16);
    expect(c16.toDense()).toEqual(values);
    c16.set(5, 60000);
    expect(c16.get(5)).toBe(60000);
  });

  it('fill resets to a uniform chunk', () => {
    const c = PalettedChunk.fromDense(generateChunkDense(0, 0, 0, 1));
    c.fill(BlockType.Stone);
    expect(c.bits).toBe(0);
    expect(c.uniformBlock()).toBe(BlockType.Stone);
    expect(c.getLocal(31, 31, 31)).toBe(BlockType.Stone);
  });

  it('round-trips dense arrays with an optimal palette', () => {
    const dense = generateChunkDense(3, 0, -2, 99);
    const c = PalettedChunk.fromDense(dense);
    const distinct = new Set(dense).size;
    expect(c.paletteEntries.length).toBe(distinct);
    expect(c.bits).toBe(bitsForPaletteSize(distinct));
    expect(c.toDense()).toEqual(dense);
    expect(c.dataByteLength).toBe((CHUNK_VOLUME * c.bits) / 8);
    expect(c.dataByteLength).toBeLessThan(dense.byteLength);
  });
});

describe('GPU slot layout', () => {
  it('packs indices LSB-first with x fastest, matching gather.wgsl decoding', () => {
    const c = new PalettedChunk();
    for (let x = 0; x < 8; x++) c.set(localIndex(x, 0, 0), 1 + (x % 6));
    c.set(localIndex(31, 31, 31), BlockType.Basalt);
    const words = new Uint32Array(GPU_SLOT_WORDS);
    const written = c.writeGpuLayout(words);
    expect(written).toBe(GPU_DATA_OFFSET + dataWordsForBits(c.bits));
    const bits = words[0]!;
    const paletteLength = words[1]!;
    expect(bits).toBe(c.bits);
    expect(paletteLength).toBe(c.paletteEntries.length);
    expect(words[2]).toBe(9);
    // Decode exactly like the shader does.
    const decode = (index: number): number => {
      if (bits === 0) return words[GPU_PALETTE_OFFSET]!;
      const bitIndex = index * bits;
      const word = words[GPU_DATA_OFFSET + (bitIndex >>> 5)]!;
      return words[GPU_PALETTE_OFFSET + ((word >>> (bitIndex & 31)) & ((1 << bits) - 1))]!;
    };
    for (let i = 0; i < CHUNK_VOLUME; i += 97) expect(decode(i)).toBe(c.get(i));
    for (let x = 0; x < 8; x++) expect(decode(localIndex(x, 0, 0))).toBe(1 + (x % 6));
    expect(decode(CHUNK_VOLUME - 1)).toBe(BlockType.Basalt);
  });

  it('round-trips through the GPU layout at every supported width', () => {
    const rand = mulberry32(3);
    for (const types of [1, 2, 3, 5, 7]) {
      const dense = new Uint16Array(CHUNK_VOLUME);
      for (let i = 0; i < CHUNK_VOLUME; i++) dense[i] = Math.floor(rand() * types);
      const c = PalettedChunk.fromDense(dense);
      const words = new Uint32Array(GPU_SLOT_WORDS + 8);
      c.writeGpuLayout(words, 8);
      expect(PalettedChunk.fromGpuLayout(words, 8).toDense()).toEqual(dense);
    }
  });

  it('decodes the 8-bit identity-palette layout written by worldgen.wgsl', () => {
    const dense = generateChunkDense(0, 0, 0, 1337);
    const words = new Uint32Array(GPU_SLOT_WORDS);
    words[0] = 8;
    words[1] = MAX_GPU_PALETTE;
    for (let p = 0; p < MAX_GPU_PALETTE; p++) words[GPU_PALETTE_OFFSET + p] = p;
    for (let w = 0; w < GPU_DATA_WORDS; w++) {
      let packed = 0;
      for (let k = 0; k < 4; k++) packed |= dense[w * 4 + k]! << (k * 8);
      words[GPU_DATA_OFFSET + w] = packed >>> 0;
    }
    const chunk = PalettedChunk.fromGpuLayout(words);
    expect(chunk.toDense()).toEqual(dense);
    expect(chunk.bits).toBeLessThanOrEqual(8);
  });

  it('rejects corrupt GPU layouts', () => {
    const words = new Uint32Array(GPU_SLOT_WORDS);
    words[0] = 3;
    words[1] = 2;
    expect(() => PalettedChunk.fromGpuLayout(words)).toThrow(RangeError);
    words[0] = 1;
    words[1] = 1;
    words[GPU_DATA_OFFSET] = 0b10;
    expect(() => PalettedChunk.fromGpuLayout(words)).toThrow(RangeError);
  });

  it('compacts before serialising palettes that exceed the GPU limit', () => {
    const c = new PalettedChunk();
    // 40 distinct ids at some point, but only 2 survive.
    for (let i = 0; i < 40; i++) c.set(i, 100 + i);
    for (let i = 1; i < 40; i++) c.set(i, BlockType.Air);
    expect(c.paletteEntries.length).toBeGreaterThan(MAX_GPU_PALETTE);
    const words = new Uint32Array(GPU_SLOT_WORDS);
    c.writeGpuLayout(words);
    expect(words[0]).toBe(1);
    expect(PalettedChunk.fromGpuLayout(words).get(0)).toBe(100);
  });
});
