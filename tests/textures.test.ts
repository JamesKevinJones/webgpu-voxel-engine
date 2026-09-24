import { describe, expect, it } from 'vitest';
import { TEXTURE_LAYER, TEXTURE_LAYERS, TEXTURE_MIP_LEVELS, TEXTURE_SIZE, generateBlockTextures, texel } from '../src/gpu/block-textures';
import { SHADER_CONSTANTS } from '../src/gpu/shader-prelude';

describe('block textures', () => {
  const data = generateBlockTextures();

  it('covers every required texture as a 16×16 layer with a full mip chain', () => {
    for (const name of ['grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'wood_side', 'wood_top', 'leaves', 'water'] as const) {
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

  it('is deterministic, opaque, and actually textured (not flat colours)', () => {
    expect(generateBlockTextures().mips[0]).toEqual(data.mips[0]);
    const base = data.mips[0]!;
    for (let l = 0; l < data.layers; l++) {
      const values = new Set<number>();
      for (let i = 0; i < TEXTURE_SIZE * TEXTURE_SIZE; i++) {
        const o = (l * TEXTURE_SIZE * TEXTURE_SIZE + i) * 4;
        expect(base[o + 3]).toBe(255);
        values.add(base[o]! * 65536 + base[o + 1]! * 256 + base[o + 2]!);
      }
      expect(values.size, TEXTURE_LAYERS[l]).toBeGreaterThan(8);
    }
  });

  it('draws grass on the top rows of grass_side and dirt below', () => {
    const l = TEXTURE_LAYER.grass_side;
    for (let x = 0; x < 16; x++) {
      const top = texel(l, x, 0), bottom = texel(l, x, 15);
      expect(top[1]).toBeGreaterThan(top[0]); // green
      expect(bottom[0]).toBeGreaterThan(bottom[2]); // brown
    }
  });

  it('averages mips in linear space (mean brightness is preserved)', () => {
    const mean = (m: Uint8Array, layer: number, size: number) => {
      let sum = 0;
      for (let i = 0; i < size * size; i++) {
        const c = m[(layer * size * size + i) * 4]! / 255;
        sum += c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      }
      return sum / (size * size);
    };
    for (let l = 0; l < data.layers; l++) {
      expect(mean(data.mips.at(-1)!, l, 1)).toBeCloseTo(mean(data.mips[0]!, l, 16), 2);
    }
  });

  it('exposes every layer index to the shaders', () => {
    const names = new Map(SHADER_CONSTANTS.map(([n, v]) => [n, v]));
    TEXTURE_LAYERS.forEach((name, i) => expect(names.get(`TEX_${name.toUpperCase()}`)).toBe(i));
  });
});
