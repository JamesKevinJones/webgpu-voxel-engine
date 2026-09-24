import { BlockType, MAX_GPU_PALETTE } from './block';
import { CHUNK_VOLUME, localIndex } from './coords';

/**
 * GPU voxel slot layout (u32 words), shared with `gather.wgsl` / `worldgen.wgsl`:
 *   [0] bits per palette index (0, 1, 2 or 4)
 *   [1] palette length
 *   [2] non-air voxel count (informational)
 *   [3] reserved
 *   [4 .. 4+16) palette → block ids
 *   [20 .. 20+4096) packed palette indices, LSB-first, x fastest
 */
export const GPU_HEADER_WORDS = 4;
export const GPU_PALETTE_OFFSET = GPU_HEADER_WORDS;
export const GPU_DATA_OFFSET = GPU_PALETTE_OFFSET + MAX_GPU_PALETTE;
export const GPU_MAX_BITS = 4;
export const GPU_DATA_WORDS = (CHUNK_VOLUME * GPU_MAX_BITS) / 32;
export const GPU_SLOT_WORDS = GPU_DATA_OFFSET + GPU_DATA_WORDS;

const VALID_BITS = [0, 1, 2, 4, 8, 16] as const;
export type PaletteBits = (typeof VALID_BITS)[number];

/** Smallest power-of-two index width able to address `size` palette entries. */
export function bitsForPaletteSize(size: number): PaletteBits {
  if (size <= 1) return 0;
  if (size <= 2) return 1;
  if (size <= 4) return 2;
  if (size <= 16) return 4;
  if (size <= 256) return 8;
  if (size <= 65536) return 16;
  throw new RangeError(`palette size ${size} exceeds 65536 entries`);
}

/** Number of u32 words needed to store CHUNK_VOLUME indices of `bits` width. */
export function dataWordsForBits(bits: number): number {
  return (CHUNK_VOLUME * bits) / 32;
}

/**
 * Palette-compressed voxel storage for one 32³ chunk.
 *
 * Every voxel stores an index into a small per-chunk palette of block ids. Index widths are
 * powers of two so an index never straddles a 32-bit word. Palette entries are reference
 * counted: entries whose count drops to zero are recycled before the palette grows, so the
 * palette never holds more entries than there are distinct block types.
 */
export class PalettedChunk {
  private bitsValue: PaletteBits = 0;
  private indexShift = 0; // log2(indices per word)
  private bitShift = 0; // log2(bits)
  private mask = 0;
  private data: Uint32Array | null = null;
  private readonly palette: number[] = [];
  private readonly counts: number[] = [];
  private readonly lookup = new Map<number, number>();

  constructor(fill: number = BlockType.Air) {
    this.palette.push(fill);
    this.counts.push(CHUNK_VOLUME);
    this.lookup.set(fill, 0);
  }

  get bits(): PaletteBits {
    return this.bitsValue;
  }

  /** Palette entries, including recycled (zero count) slots. */
  get paletteEntries(): readonly number[] {
    return this.palette;
  }

  /** Number of palette entries referenced by at least one voxel. */
  get liveEntries(): number {
    let n = 0;
    for (const c of this.counts) if (c > 0) n++;
    return n;
  }

  /** Bytes used by the packed index array. */
  get dataByteLength(): number {
    return this.data ? this.data.byteLength : 0;
  }

  /** Raw packed words (null when every voxel shares palette entry 0). */
  get rawData(): Uint32Array | null {
    return this.data;
  }

  countOf(block: number): number {
    const p = this.lookup.get(block);
    return p === undefined ? 0 : this.counts[p]!;
  }

  get nonAirCount(): number {
    return CHUNK_VOLUME - this.countOf(BlockType.Air);
  }

  /** The single block filling the whole chunk, or -1 if the chunk is mixed. */
  uniformBlock(): number {
    for (let i = 0; i < this.counts.length; i++) {
      if (this.counts[i] === CHUNK_VOLUME) return this.palette[i]!;
    }
    return -1;
  }

  get(index: number): number {
    if (this.bitsValue === 0) return this.palette[0]!;
    const word = this.data![index >>> this.indexShift]!;
    const shift = (index & ((1 << this.indexShift) - 1)) << this.bitShift;
    return this.palette[(word >>> shift) & this.mask]!;
  }

  getLocal(lx: number, ly: number, lz: number): number {
    return this.get(localIndex(lx, ly, lz));
  }

  /** Sets a voxel; returns true if its block changed. */
  set(index: number, block: number): boolean {
    const oldIndex = this.getPaletteIndex(index);
    if (this.palette[oldIndex] === block) return false;
    // Release first so the old entry can be recycled if this was its last voxel.
    this.counts[oldIndex]!--;
    const newIndex = this.acquireEntry(block);
    this.counts[newIndex]!++;
    if (newIndex !== oldIndex) {
      // acquireEntry may have repacked; bits > 0 here because the palette has ≥ 2 entries.
      this.writeIndex(index, newIndex);
    }
    return true;
  }

  setLocal(lx: number, ly: number, lz: number, block: number): boolean {
    return this.set(localIndex(lx, ly, lz), block);
  }

  /** Replaces the whole chunk with a single block, dropping all packed data. */
  fill(block: number): void {
    this.palette.length = 0;
    this.counts.length = 0;
    this.lookup.clear();
    this.palette.push(block);
    this.counts.push(CHUNK_VOLUME);
    this.lookup.set(block, 0);
    this.setBits(0);
    this.data = null;
  }

  /** Drops unreferenced palette entries and shrinks the index width to the minimum. */
  compact(): void {
    if (this.liveEntries === this.palette.length && bitsForPaletteSize(this.palette.length) === this.bitsValue) return;
    const dense = this.toDense();
    const rebuilt = PalettedChunk.fromDense(dense);
    this.adopt(rebuilt);
  }

  /** Decodes every voxel into a flat array of block ids. */
  toDense(out: Uint16Array = new Uint16Array(CHUNK_VOLUME)): Uint16Array {
    if (this.bitsValue === 0) {
      out.fill(this.palette[0]!);
      return out;
    }
    const data = this.data!;
    const perWord = 1 << this.indexShift;
    const bits = this.bitsValue;
    const mask = this.mask;
    const palette = this.palette;
    let i = 0;
    for (let w = 0; w < data.length; w++) {
      let word = data[w]!;
      for (let k = 0; k < perWord; k++) {
        out[i++] = palette[word & mask]!;
        word >>>= bits;
      }
    }
    return out;
  }

  /** Builds an optimally packed chunk (palette in first-occurrence order). */
  static fromDense(values: ArrayLike<number>): PalettedChunk {
    if (values.length !== CHUNK_VOLUME) throw new RangeError(`expected ${CHUNK_VOLUME} voxels, got ${values.length}`);
    const chunk = new PalettedChunk(values[0]!);
    const palette: number[] = [];
    const counts: number[] = [];
    const lookup = new Map<number, number>();
    const indices = new Uint16Array(CHUNK_VOLUME);
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const v = values[i]!;
      let p = lookup.get(v);
      if (p === undefined) {
        p = palette.length;
        palette.push(v);
        counts.push(0);
        lookup.set(v, p);
      }
      counts[p]!++;
      indices[i] = p;
    }
    chunk.palette.length = 0;
    chunk.counts.length = 0;
    chunk.lookup.clear();
    palette.forEach((v, i) => {
      chunk.palette.push(v);
      chunk.counts.push(counts[i]!);
      chunk.lookup.set(v, i);
    });
    const bits = bitsForPaletteSize(palette.length);
    chunk.setBits(bits);
    chunk.data = bits === 0 ? null : packIndices(indices, bits);
    return chunk;
  }

  /** Number of u32 words `writeGpuLayout` will write. */
  gpuWordCount(): number {
    return GPU_DATA_OFFSET + dataWordsForBits(this.bitsValue);
  }

  /**
   * Serialises into the GPU slot layout. Compacts first if the palette is too large for the
   * 4-bit GPU encoding. Returns the number of words written.
   */
  writeGpuLayout(out: Uint32Array, offset = 0): number {
    if (this.bitsValue > GPU_MAX_BITS) this.compact();
    if (this.bitsValue > GPU_MAX_BITS) {
      throw new RangeError(`chunk palette (${this.palette.length} entries) exceeds GPU limit of ${MAX_GPU_PALETTE}`);
    }
    out[offset] = this.bitsValue;
    out[offset + 1] = this.palette.length;
    out[offset + 2] = this.nonAirCount;
    out[offset + 3] = 0;
    for (let i = 0; i < MAX_GPU_PALETTE; i++) {
      out[offset + GPU_PALETTE_OFFSET + i] = i < this.palette.length ? this.palette[i]! : 0;
    }
    if (this.data) out.set(this.data, offset + GPU_DATA_OFFSET);
    return this.gpuWordCount();
  }

  /** Decodes a GPU slot (as produced by the worldgen shader or writeGpuLayout) and re-packs optimally. */
  static fromGpuLayout(words: Uint32Array, offset = 0): PalettedChunk {
    const bits = words[offset]!;
    const paletteLength = words[offset + 1]!;
    if (!(bits === 0 || bits === 1 || bits === 2 || bits === 4)) throw new RangeError(`invalid GPU bits ${bits}`);
    if (paletteLength < 1 || paletteLength > MAX_GPU_PALETTE) throw new RangeError(`invalid palette length ${paletteLength}`);
    const palette = words.subarray(offset + GPU_PALETTE_OFFSET, offset + GPU_PALETTE_OFFSET + MAX_GPU_PALETTE);
    const dense = new Uint16Array(CHUNK_VOLUME);
    if (bits === 0) {
      dense.fill(palette[0]!);
    } else {
      const perWord = 32 / bits;
      const mask = (1 << bits) - 1;
      const base = offset + GPU_DATA_OFFSET;
      let i = 0;
      for (let w = 0; w < dataWordsForBits(bits); w++) {
        let word = words[base + w]!;
        for (let k = 0; k < perWord; k++) {
          const p = word & mask;
          if (p >= paletteLength) throw new RangeError(`palette index ${p} out of range at voxel ${i}`);
          dense[i++] = palette[p]!;
          word >>>= bits;
        }
      }
    }
    return PalettedChunk.fromDense(dense);
  }

  // ---------------------------------------------------------------- internals

  private getPaletteIndex(index: number): number {
    if (this.bitsValue === 0) return 0;
    const word = this.data![index >>> this.indexShift]!;
    return (word >>> ((index & ((1 << this.indexShift) - 1)) << this.bitShift)) & this.mask;
  }

  private writeIndex(index: number, paletteIndex: number): void {
    const data = this.data!;
    const w = index >>> this.indexShift;
    const shift = (index & ((1 << this.indexShift) - 1)) << this.bitShift;
    data[w] = ((data[w]! & ~(this.mask << shift)) | (paletteIndex << shift)) >>> 0;
  }

  /** Returns the palette index for `block`, recycling or appending (and repacking) as needed. */
  private acquireEntry(block: number): number {
    const existing = this.lookup.get(block);
    if (existing !== undefined) return existing;
    for (let i = 0; i < this.counts.length; i++) {
      if (this.counts[i] === 0) {
        this.lookup.delete(this.palette[i]!);
        this.palette[i] = block;
        this.lookup.set(block, i);
        return i;
      }
    }
    const index = this.palette.length;
    this.palette.push(block);
    this.counts.push(0);
    this.lookup.set(block, index);
    const needed = bitsForPaletteSize(this.palette.length);
    if (needed !== this.bitsValue) this.repack(needed);
    return index;
  }

  private repack(bits: PaletteBits): void {
    const indices = new Uint16Array(CHUNK_VOLUME);
    if (this.bitsValue !== 0) {
      for (let i = 0; i < CHUNK_VOLUME; i++) indices[i] = this.getPaletteIndex(i);
    }
    this.setBits(bits);
    this.data = bits === 0 ? null : packIndices(indices, bits);
  }

  private setBits(bits: PaletteBits): void {
    this.bitsValue = bits;
    this.bitShift = bits === 0 ? 0 : Math.log2(bits);
    this.indexShift = bits === 0 ? 0 : 5 - this.bitShift;
    this.mask = bits === 0 ? 0 : (1 << bits) - 1;
  }

  private adopt(other: PalettedChunk): void {
    this.palette.length = 0;
    this.counts.length = 0;
    this.lookup.clear();
    other.palette.forEach((v, i) => {
      this.palette.push(v);
      this.counts.push(other.counts[i]!);
      this.lookup.set(v, i);
    });
    this.setBits(other.bitsValue);
    this.data = other.data;
  }
}

function packIndices(indices: Uint16Array, bits: number): Uint32Array {
  const perWord = 32 / bits;
  const out = new Uint32Array(dataWordsForBits(bits));
  for (let w = 0; w < out.length; w++) {
    let word = 0;
    const base = w * perWord;
    for (let k = perWord - 1; k >= 0; k--) {
      word = (word << bits) | indices[base + k]!;
    }
    out[w] = word >>> 0;
  }
  return out;
}
