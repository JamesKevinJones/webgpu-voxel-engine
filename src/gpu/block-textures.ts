import { hash3 } from '../world/noise';

/**
 * Procedural 16×16 pixel-art block textures, generated deterministically on the CPU and uploaded
 * as an `rgba8unorm-srgb` 2D texture array with a full mip chain.
 */
export const TEXTURE_SIZE = 16;
export const TEXTURE_LAYERS = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'wood_side', 'wood_top', 'leaves', 'water', 'basalt', 'bedrock',
] as const;
export type TextureName = (typeof TEXTURE_LAYERS)[number];
export const TEXTURE_LAYER: Record<TextureName, number> = Object.fromEntries(
  TEXTURE_LAYERS.map((name, i) => [name, i]),
) as Record<TextureName, number>;
export const TEXTURE_MIP_LEVELS = Math.log2(TEXTURE_SIZE) + 1;

type Rgb = [number, number, number];

/** Deterministic per-pixel random in [0, 1). */
function rnd(x: number, y: number, layer: number, salt = 0): number {
  return hash3(x, y, layer * 131 + salt, 0x5eed) / 4294967296;
}

function shade(c: Rgb, f: number): Rgb {
  return [c[0] * f, c[1] * f, c[2] * f];
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const GRASS: Rgb = [0.37, 0.62, 0.22];
const DIRT: Rgb = [0.47, 0.33, 0.21];
const STONE: Rgb = [0.52, 0.52, 0.54];
const SAND: Rgb = [0.87, 0.81, 0.6];
const BARK: Rgb = [0.4, 0.29, 0.17];
const RINGS: Rgb = [0.66, 0.51, 0.31];
const LEAVES: Rgb = [0.23, 0.47, 0.16];
const WATER: Rgb = [0.2, 0.42, 0.66];
const BASALT: Rgb = [0.2, 0.2, 0.24];
const BEDROCK: Rgb = [0.3, 0.3, 0.31];

function dirtPixel(x: number, y: number, layer: number): Rgb {
  const r = rnd(x, y, layer);
  if (r < 0.12) return shade(DIRT, 0.72);
  if (r > 0.93) return shade(DIRT, 1.22);
  return shade(DIRT, 0.92 + 0.14 * rnd(x, y, layer, 1));
}

/** sRGB colour (0..1) of one texel. v = 0 is the top row (the upper edge of side faces). */
export function texel(layer: number, x: number, y: number): Rgb {
  const r = rnd(x, y, layer);
  switch (TEXTURE_LAYERS[layer]) {
    case 'grass_top':
      return shade(GRASS, r < 0.15 ? 0.8 : r > 0.9 ? 1.15 : 0.92 + 0.14 * rnd(x, y, layer, 1));
    case 'grass_side': {
      const edge = 3 + (rnd(x, 0, layer, 7) < 0.5 ? 1 : 0) + (rnd(x, 0, layer, 8) < 0.25 ? 1 : 0);
      if (y < edge) return shade(GRASS, 0.88 + 0.16 * r);
      return dirtPixel(x, y, layer);
    }
    case 'dirt':
      return dirtPixel(x, y, layer);
    case 'stone': {
      const blotch = rnd(x >> 2, y >> 2, layer, 3);
      const crack = rnd(x, y, layer, 4) < 0.06;
      return shade(STONE, crack ? 0.7 : 0.86 + 0.12 * blotch + 0.08 * r);
    }
    case 'sand':
      return shade(SAND, r < 0.1 ? 0.88 : 0.95 + 0.08 * rnd(x, y, layer, 1));
    case 'wood_side': {
      const stripe = rnd(x, 0, layer, 5);
      return shade(BARK, (stripe < 0.3 ? 0.75 : 1.0) * (0.9 + 0.12 * r));
    }
    case 'wood_top': {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.8) return shade(BARK, 0.9 + 0.1 * r);
      return shade(RINGS, (Math.floor(d) % 2 === 0 ? 1.0 : 0.82) * (0.94 + 0.08 * r));
    }
    case 'leaves':
      return r < 0.18 ? shade(LEAVES, 0.55) : shade(LEAVES, 0.85 + 0.3 * rnd(x, y, layer, 1));
    case 'water': {
      const wave = Math.sin((x + y * 0.5) * 0.9) * 0.5 + 0.5;
      return mixRgb(WATER, shade(WATER, 1.35), wave * 0.35 + r * 0.1);
    }
    case 'basalt': {
      const column = x % 5 === 0 ? 0.7 : 1.0;
      return shade(BASALT, column * (0.85 + 0.25 * r));
    }
    case 'bedrock':
      return shade(BEDROCK, r < 0.4 ? 0.35 + 0.2 * r : 0.8 + 0.4 * rnd(x, y, layer, 1));
    default:
      return [1, 0, 1];
  }
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export interface BlockTextureData {
  size: number;
  layers: number;
  /** RGBA8 sRGB pixels per mip level, layers stacked (layer-major, rows top to bottom). */
  mips: Uint8Array<ArrayBuffer>[];
}

/** Generates every layer plus a gamma-correct box-filtered mip chain. */
export function generateBlockTextures(): BlockTextureData {
  const layers = TEXTURE_LAYERS.length;
  let size = TEXTURE_SIZE;
  let linear = new Float32Array(size * size * layers * 3);
  for (let l = 0; l < layers; l++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = texel(l, x, y);
        const o = ((l * size + y) * size + x) * 3;
        for (let k = 0; k < 3; k++) linear[o + k] = toLinear(Math.min(1, Math.max(0, c[k]!)));
      }
    }
  }
  const mips: Uint8Array<ArrayBuffer>[] = [];
  for (;;) {
    const bytes = new Uint8Array(size * size * layers * 4);
    for (let i = 0; i < size * size * layers; i++) {
      for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(toSrgb(linear[i * 3 + k]!) * 255);
      bytes[i * 4 + 3] = 255;
    }
    mips.push(bytes);
    if (size === 1) break;
    const half = size / 2;
    const next = new Float32Array(half * half * layers * 3);
    for (let l = 0; l < layers; l++) {
      for (let y = 0; y < half; y++) {
        for (let x = 0; x < half; x++) {
          for (let k = 0; k < 3; k++) {
            let sum = 0;
            for (let dy = 0; dy < 2; dy++) {
              for (let dx = 0; dx < 2; dx++) sum += linear[((l * size + y * 2 + dy) * size + x * 2 + dx) * 3 + k]!;
            }
            next[((l * half + y) * half + x) * 3 + k] = sum / 4;
          }
        }
      }
    }
    linear = next;
    size = half;
  }
  return { size: TEXTURE_SIZE, layers, mips };
}

/** Uploads the texture array (all mips) and returns it with a pixel-art friendly sampler. */
export function createBlockTextureArray(device: GPUDevice): { texture: GPUTexture; sampler: GPUSampler } {
  const data = generateBlockTextures();
  const texture = device.createTexture({
    label: 'block textures',
    size: { width: data.size, height: data.size, depthOrArrayLayers: data.layers },
    format: 'rgba8unorm-srgb',
    mipLevelCount: data.mips.length,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  data.mips.forEach((pixels, level) => {
    const s = data.size >> level;
    device.queue.writeTexture(
      { texture, mipLevel: level },
      pixels,
      { bytesPerRow: s * 4, rowsPerImage: s },
      { width: s, height: s, depthOrArrayLayers: data.layers },
    );
  });
  const sampler = device.createSampler({
    label: 'block sampler',
    magFilter: 'nearest',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });
  return { texture, sampler };
}
