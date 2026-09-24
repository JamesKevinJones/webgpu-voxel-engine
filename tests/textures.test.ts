import { describe, expect, it } from 'vitest';
import {
  BLOCK_TEXTURES,
  CRACK_STAGES,
  TEXTURE_LAYER,
  TEXTURE_LAYERS,
  TEXTURE_MIP_LEVELS,
  TEXTURE_SIZE,
  TINTED_LAYERS,
  generateBlockTextures,
  texelRgba,
  textureFunctions,
} from '../src/gpu/block-textures';
import { SHADER_CONSTANTS } from '../src/gpu/shader-prelude';
import { BLOCK_TYPE_COUNT } from '../src/world/block';

const ALPHA_LAYERS = new Set<string>(['glass', 'tall_grass', 'red_flower', 'yellow_flower', 'grass_side',
  ...Array.from({ length: CRACK_STAGES }, (_, i) => `crack_${i}`)]);

describe('block textures', () => {
  const data = generateBlockTextures();
  const alphaAt = (m: Uint8Array, layer: number, i: number, size = TEXTURE_SIZE) => m[(layer * size * size + i) * 4 + 3]!;

  it('covers every required texture as a 16×16 layer with a full mip chain', () => {
    for (const name of ['grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'wood_side', 'wood_top', 'leaves', 'water',
      'glass', 'cobblestone', 'brick', 'snow', 'ice', 'sandstone_side', 'cactus_side', 'tall_grass'] as const) {
      expect(TEXTURE_LAYERS).toContain(name);
    }
    expect(data.size).toBe(16);
    expect(data.layers).toBe(TEXTURE_LAYERS.length);
    expect(data.mips).toHaveLength(TEXTURE_MIP_LEVELS);
    data.mips.forEach((m, level) => {
      const s = TEXTURE_SIZE >> level;
      expect(m.length).toBe(s * s * data.layers * 4);
    });
  });

  it('gives every block a texture for each face', () => {
    for (let b = 1; b < BLOCK_TYPE_COUNT; b++) {
      const faces = BLOCK_TEXTURES[b];
      expect(faces, `block ${b}`).toBeDefined();
      for (const f of faces!) expect(TEXTURE_LAYERS).toContain(f);
    }
    const wgsl = textureFunctions();
    for (let b = 1; b < BLOCK_TYPE_COUNT; b++) expect(wgsl).toContain(`case ${b}u:`);
  });

  it('is deterministic and textured; opaque layers are fully opaque, cutout layers have holes', () => {
    expect(generateBlockTextures().mips[0]).toEqual(data.mips[0]);
    const base = data.mips[0]!;
    for (let l = 0; l < data.layers; l++) {
      const name = TEXTURE_LAYERS[l]!;
      const values = new Set<number>();
      let transparent = 0;
      for (let i = 0; i < TEXTURE_SIZE * TEXTURE_SIZE; i++) {
        const o = (l * TEXTURE_SIZE * TEXTURE_SIZE + i) * 4;
        if (alphaAt(base, l, i) < 128) transparent++;
        values.add(base[o]! * 65536 + base[o + 1]! * 256 + base[o + 2]!);
      }
      if (ALPHA_LAYERS.has(name)) {
        expect(transparent, name).toBeGreaterThan(0);
        expect(transparent, name).toBeLessThan(256);
      } else {
        expect(transparent, name).toBe(0);
        expect(values.size, name).toBeGreaterThan(name === 'snow' ? 3 : 8);
      }
    }
  });

  it('marks the grass overhang of grass_side as tinted (alpha 1) and the dirt below as untinted', () => {
    const l = TEXTURE_LAYER.grass_side;
    for (let x = 0; x < 16; x++) {
      expect(texelRgba(l, x, 0)[3]).toBe(1);
      const dirt = texelRgba(l, x, 15);
      expect(dirt[3]).toBe(0);
      expect(dirt[0]).toBeGreaterThan(dirt[2]); // brown
    }
    // Tinted layers are neutral grey so the biome palette provides the hue.
    const top = texelRgba(TEXTURE_LAYER.grass_top, 3, 3);
    expect(top[0]).toBeCloseTo(top[1], 6);
    expect(Object.keys(TINTED_LAYERS)).toEqual(expect.arrayContaining(['grass_top', 'grass_side', 'leaves', 'tall_grass']));
  });

  it('grows crack coverage with the break stage', () => {
    let prev = -1;
    for (let s = 0; s < CRACK_STAGES; s++) {
      let covered = 0;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) covered += texelRgba(TEXTURE_LAYER[`crack_${s}` as 'crack_0'], x, y)[3];
      expect(covered).toBeGreaterThanOrEqual(prev);
      prev = covered;
    }
    expect(prev).toBeGreaterThan(20);
  });

  it('builds mips in linear space: brightness and coverage are preserved', () => {
    const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const mean = (m: Uint8Array, layer: number, size: number, channel: number, linearize: boolean) => {
      let sum = 0;
      for (let i = 0; i < size * size; i++) {
        const v = m[(layer * size * size + i) * 4 + channel]! / 255;
        sum += linearize ? toLinear(v) : v;
      }
      return sum / (size * size);
    };
    for (let l = 0; l < data.layers; l++) {
      const last = data.mips.at(-1)!;
      expect(mean(last, l, 1, 3, false)).toBeCloseTo(mean(data.mips[0]!, l, 16, 3, false), 2);
      if (!ALPHA_LAYERS.has(TEXTURE_LAYERS[l]!)) {
        expect(mean(last, l, 1, 0, true)).toBeCloseTo(mean(data.mips[0]!, l, 16, 0, true), 2);
      }
    }
  });

  it('exposes every layer index to the shaders', () => {
    const names = new Map(SHADER_CONSTANTS.map(([n, v]) => [n, v]));
    TEXTURE_LAYERS.forEach((name, i) => expect(names.get(`TEX_${name.toUpperCase()}`)).toBe(i));
  });
});
