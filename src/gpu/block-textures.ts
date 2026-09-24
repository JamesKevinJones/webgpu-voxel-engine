import { BLOCK_TYPE_COUNT, BlockType } from '../world/block';
import { hash3 } from '../world/noise';

/**
 * Procedural 16×16 pixel-art block textures, generated deterministically on the CPU and uploaded
 * as an `rgba8unorm-srgb` 2D texture array with a full mip chain.
 */
export const TEXTURE_SIZE = 16;
export const CRACK_STAGES = 10;
export const TEXTURE_LAYERS = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'wood_side', 'wood_top', 'leaves', 'water', 'basalt', 'bedrock',
  'sandstone_side', 'sandstone_top', 'snow', 'ice', 'cactus_side', 'cactus_top', 'birch_side', 'pine_side',
  'pine_leaves', 'glass', 'cobblestone', 'brick', 'tall_grass', 'red_flower', 'yellow_flower',
  'crack_0', 'crack_1', 'crack_2', 'crack_3', 'crack_4', 'crack_5', 'crack_6', 'crack_7', 'crack_8', 'crack_9',
] as const;
export type TextureName = (typeof TEXTURE_LAYERS)[number];
export const TEXTURE_LAYER: Record<TextureName, number> = Object.fromEntries(
  TEXTURE_LAYERS.map((name, i) => [name, i]),
) as Record<TextureName, number>;
export const TEXTURE_MIP_LEVELS = Math.log2(TEXTURE_SIZE) + 1;

/** Texture layers per block: [top, side, bottom]. */
export const BLOCK_TEXTURES: Readonly<Record<number, readonly [TextureName, TextureName, TextureName]>> = {
  [BlockType.Stone]: ['stone', 'stone', 'stone'],
  [BlockType.Dirt]: ['dirt', 'dirt', 'dirt'],
  [BlockType.Grass]: ['grass_top', 'grass_side', 'dirt'],
  [BlockType.Sand]: ['sand', 'sand', 'sand'],
  [BlockType.Water]: ['water', 'water', 'water'],
  [BlockType.Basalt]: ['basalt', 'basalt', 'basalt'],
  [BlockType.Wood]: ['wood_top', 'wood_side', 'wood_top'],
  [BlockType.Leaves]: ['leaves', 'leaves', 'leaves'],
  [BlockType.Bedrock]: ['bedrock', 'bedrock', 'bedrock'],
  [BlockType.Sandstone]: ['sandstone_top', 'sandstone_side', 'sandstone_top'],
  [BlockType.Snow]: ['snow', 'snow', 'snow'],
  [BlockType.Ice]: ['ice', 'ice', 'ice'],
  [BlockType.Cactus]: ['cactus_top', 'cactus_side', 'cactus_top'],
  [BlockType.BirchWood]: ['wood_top', 'birch_side', 'wood_top'],
  [BlockType.PineWood]: ['wood_top', 'pine_side', 'wood_top'],
  [BlockType.PineLeaves]: ['pine_leaves', 'pine_leaves', 'pine_leaves'],
  [BlockType.Glass]: ['glass', 'glass', 'glass'],
  [BlockType.Cobblestone]: ['cobblestone', 'cobblestone', 'cobblestone'],
  [BlockType.Brick]: ['brick', 'brick', 'brick'],
  [BlockType.TallGrass]: ['tall_grass', 'tall_grass', 'tall_grass'],
  [BlockType.RedFlower]: ['red_flower', 'red_flower', 'red_flower'],
  [BlockType.YellowFlower]: ['yellow_flower', 'yellow_flower', 'yellow_flower'],
};

/**
 * Biome tinting per layer: 'full' multiplies the whole texel by the grass/foliage tint, 'masked'
 * tints only where alpha = 1 (the grass overhang of grass_side; alpha is not coverage there).
 */
export const TINTED_LAYERS: Readonly<Partial<Record<TextureName, 'full' | 'masked'>>> = {
  grass_top: 'full',
  grass_side: 'masked',
  leaves: 'full',
  tall_grass: 'full',
};

/** WGSL `textureLayer(block, face)` and `tintMode(layer)` generated from the tables above. */
export function textureFunctions(): string {
  const lines = ['fn textureLayer(block: u32, face: u32) -> i32 {', '  var t = 0;', '  var s = 0;', '  var b = 0;', '  switch block {'];
  for (let block = 1; block < BLOCK_TYPE_COUNT; block++) {
    const [top, side, bottom] = BLOCK_TEXTURES[block]!;
    lines.push(`    case ${block}u: { t = ${TEXTURE_LAYER[top]}; s = ${TEXTURE_LAYER[side]}; b = ${TEXTURE_LAYER[bottom]}; }`);
  }
  lines.push('    default: {}', '  }', '  if (face == 2u) { return t; }', '  if (face == 3u) { return b; }', '  return s;', '}');
  lines.push('fn tintMode(layer: i32) -> u32 {', '  switch layer {');
  for (const [name, mode] of Object.entries(TINTED_LAYERS)) {
    lines.push(`    case ${TEXTURE_LAYER[name as TextureName]}: { return ${mode === 'full' ? 1 : 2}u; }`);
  }
  lines.push('    default: { return 0u; }', '  }', '}');
  return lines.join('\n');
}

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

const GRASS_GRAY: Rgb = [0.78, 0.78, 0.78];
const DIRT: Rgb = [0.47, 0.33, 0.21];
const STONE: Rgb = [0.52, 0.52, 0.54];
const SAND: Rgb = [0.87, 0.81, 0.6];
const SANDSTONE: Rgb = [0.84, 0.75, 0.52];
const BARK: Rgb = [0.4, 0.29, 0.17];
const RINGS: Rgb = [0.66, 0.51, 0.31];
const WATER: Rgb = [0.2, 0.42, 0.66];
const BASALT: Rgb = [0.2, 0.2, 0.24];
const BEDROCK: Rgb = [0.3, 0.3, 0.31];
const SNOW: Rgb = [0.93, 0.95, 0.98];
const ICE: Rgb = [0.62, 0.78, 0.95];
const CACTUS: Rgb = [0.28, 0.55, 0.22];
const BIRCH: Rgb = [0.88, 0.87, 0.82];
const PINE_BARK: Rgb = [0.3, 0.21, 0.13];
const PINE_NEEDLES: Rgb = [0.16, 0.33, 0.2];
const BRICK: Rgb = [0.6, 0.28, 0.22];
const MORTAR: Rgb = [0.72, 0.7, 0.66];

type Rgba = [number, number, number, number];

function dirtPixel(x: number, y: number, layer: number): Rgb {
  const r = rnd(x, y, layer);
  if (r < 0.12) return shade(DIRT, 0.72);
  if (r > 0.93) return shade(DIRT, 1.22);
  return shade(DIRT, 0.92 + 0.14 * rnd(x, y, layer, 1));
}

function opaque(c: Rgb): Rgba {
  return [c[0], c[1], c[2], 1];
}

/** Crack overlay: alpha of stage `stage` (0..9); cracks grow outward from the centre as stages advance. */
function crackAlpha(stage: number, x: number, y: number): number {
  // A few random-walk crack lines; later stages draw more and longer lines.
  let alpha = 0;
  const lines = 2 + stage;
  for (let l = 0; l < lines; l++) {
    let px = 7.5 + (rnd(l, 0, 99, 1) - 0.5) * 4;
    let py = 7.5 + (rnd(l, 0, 99, 2) - 0.5) * 4;
    const angle = rnd(l, 0, 99, 3) * Math.PI * 2;
    const steps = 3 + stage;
    for (let k = 0; k < steps; k++) {
      if (Math.floor(px) === x && Math.floor(py) === y) alpha = 1;
      const wobble = (rnd(l, k, 99, 4) - 0.5) * 1.2;
      px += Math.cos(angle + wobble);
      py += Math.sin(angle + wobble);
    }
  }
  return alpha;
}

/**
 * Texel (x, y) of `layer`: sRGB colour in 0..1 plus alpha. v = 0 is the top row (the upper edge of
 * side faces). Alpha is coverage for cutout layers, the tint mask for grass_side, and 1 otherwise.
 */
export function texelRgba(layer: number, x: number, y: number): Rgba {
  const r = rnd(x, y, layer);
  const name = TEXTURE_LAYERS[layer]!;
  if (name.startsWith('crack_')) {
    const stage = Number(name.slice(6));
    return [0.08, 0.07, 0.06, crackAlpha(stage, x, y)];
  }
  switch (name) {
    case 'grass_top':
      return opaque(shade(GRASS_GRAY, r < 0.15 ? 0.8 : r > 0.9 ? 1.12 : 0.92 + 0.12 * rnd(x, y, layer, 1)));
    case 'grass_side': {
      const edge = 3 + (rnd(x, 0, layer, 7) < 0.5 ? 1 : 0) + (rnd(x, 0, layer, 8) < 0.25 ? 1 : 0);
      if (y < edge) return [...shade(GRASS_GRAY, 0.88 + 0.14 * r), 1] as Rgba;
      return [...dirtPixel(x, y, layer), 0] as Rgba;
    }
    case 'dirt':
      return opaque(dirtPixel(x, y, layer));
    case 'stone': {
      const blotch = rnd(x >> 2, y >> 2, layer, 3);
      const crack = rnd(x, y, layer, 4) < 0.06;
      return opaque(shade(STONE, crack ? 0.7 : 0.86 + 0.12 * blotch + 0.08 * r));
    }
    case 'sand':
      return opaque(shade(SAND, r < 0.1 ? 0.88 : 0.95 + 0.08 * rnd(x, y, layer, 1)));
    case 'wood_side': {
      const stripe = rnd(x, 0, layer, 5);
      return opaque(shade(BARK, (stripe < 0.3 ? 0.75 : 1.0) * (0.9 + 0.12 * r)));
    }
    case 'wood_top': {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.8) return opaque(shade(BARK, 0.9 + 0.1 * r));
      return opaque(shade(RINGS, (Math.floor(d) % 2 === 0 ? 1.0 : 0.82) * (0.94 + 0.08 * r)));
    }
    case 'leaves':
      return opaque(r < 0.18 ? shade(GRASS_GRAY, 0.5) : shade(GRASS_GRAY, 0.78 + 0.28 * rnd(x, y, layer, 1)));
    case 'water': {
      const wave = Math.sin((x + y * 0.5) * 0.9) * 0.5 + 0.5;
      return opaque(mixRgb(WATER, shade(WATER, 1.35), wave * 0.35 + r * 0.1));
    }
    case 'basalt':
      return opaque(shade(BASALT, (x % 5 === 0 ? 0.7 : 1.0) * (0.85 + 0.25 * r)));
    case 'bedrock':
      return opaque(shade(BEDROCK, r < 0.4 ? 0.35 + 0.2 * r : 0.8 + 0.4 * rnd(x, y, layer, 1)));
    case 'sandstone_side': {
      const band = Math.floor(y / 4) % 2 === 0 ? 1.0 : 0.9;
      return opaque(shade(SANDSTONE, band * (y % 4 === 3 ? 0.85 : 0.96 + 0.06 * r)));
    }
    case 'sandstone_top':
      return opaque(shade(SANDSTONE, 0.95 + 0.08 * r));
    case 'snow':
      return opaque(shade(SNOW, 0.95 + 0.05 * r));
    case 'ice': {
      const streak = (x + y) % 7 === 0 ? 1.12 : 1.0;
      return opaque(shade(ICE, streak * (0.94 + 0.06 * r)));
    }
    case 'cactus_side': {
      const rib = x % 4 === 1 ? 0.8 : 1.0;
      const spine = rnd(x, y, layer, 2) < 0.06;
      return opaque(spine ? [0.9, 0.88, 0.7] : shade(CACTUS, rib * (0.92 + 0.1 * r)));
    }
    case 'cactus_top': {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return opaque(shade(CACTUS, d < 3 ? 1.15 : 0.95 + 0.06 * r));
    }
    case 'birch_side': {
      const mark = rnd(Math.floor(x / 3), y, layer, 6) < 0.12;
      return opaque(mark ? [0.18, 0.17, 0.15] : shade(BIRCH, 0.94 + 0.08 * r));
    }
    case 'pine_side': {
      const stripe = rnd(x, 0, layer, 5);
      return opaque(shade(PINE_BARK, (stripe < 0.35 ? 0.78 : 1.0) * (0.9 + 0.12 * r)));
    }
    case 'pine_leaves':
      return opaque(r < 0.2 ? shade(PINE_NEEDLES, 0.6) : shade(PINE_NEEDLES, 0.85 + 0.3 * rnd(x, y, layer, 1)));
    case 'glass': {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const glint = (x - y === 3 || x - y === 4) && x > 3 && x < 12;
      if (border) return [0.82, 0.9, 0.94, 1];
      if (glint) return [0.95, 0.98, 1, 1];
      return [0, 0, 0, 0];
    }
    case 'cobblestone': {
      // Irregular stones: Voronoi-ish cells from a coarse hashed grid.
      let best = 99, second = 99, id = 0;
      for (let gy = -1; gy <= 1; gy++) {
        for (let gx = -1; gx <= 1; gx++) {
          const cx = Math.floor(x / 5) + gx, cy = Math.floor(y / 5) + gy;
          const px = cx * 5 + rnd(cx, cy, layer, 1) * 5, py = cy * 5 + rnd(cx, cy, layer, 2) * 5;
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d < best) { second = best; best = d; id = cx * 31 + cy; } else if (d < second) second = d;
        }
      }
      if (second - best < 0.9) return opaque(shade(STONE, 0.55));
      return opaque(shade(STONE, 0.8 + 0.25 * rnd(id, 0, layer, 3) + 0.06 * r));
    }
    case 'brick': {
      const row = Math.floor(y / 4);
      const offset = row % 2 === 0 ? 0 : 4;
      const mortar = y % 4 === 3 || (x + offset) % 8 === 7;
      return opaque(mortar ? shade(MORTAR, 0.95 + 0.05 * r) : shade(BRICK, 0.88 + 0.18 * rnd(Math.floor((x + offset) / 8), row, layer, 1) + 0.06 * r));
    }
    case 'tall_grass': {
      // Blades rising from the bottom edge with varying heights.
      const blade = x % 3 !== 2 && y >= 3 + Math.floor(rnd(x, 0, layer, 9) * 9);
      return blade ? [...shade(GRASS_GRAY, 0.75 + 0.3 * r), 1] as Rgba : [0, 0, 0, 0];
    }
    case 'red_flower':
    case 'yellow_flower': {
      const petal = Math.hypot(x - 7.5, y - 5) < 2.6;
      const centre = Math.hypot(x - 7.5, y - 5) < 1;
      const stem = (x === 7 || x === 8) && y > 6;
      const leaf = (y === 11 && (x === 5 || x === 6)) || (y === 10 && (x === 9 || x === 10));
      if (centre) return [0.95, 0.85, 0.3, 1];
      if (petal) return name === 'red_flower' ? [0.85, 0.12, 0.1, 1] : [0.98, 0.85, 0.15, 1];
      if (stem || leaf) return [0.2, 0.5, 0.15, 1];
      return [0, 0, 0, 0];
    }
    default:
      return [1, 0, 1, 1];
  }
}

/** sRGB colour (0..1) of one texel. */
export function texel(layer: number, x: number, y: number): Rgb {
  const c = texelRgba(layer, x, y);
  return [c[0], c[1], c[2]];
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
  let linear = new Float32Array(size * size * layers * 4);
  for (let l = 0; l < layers; l++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = texelRgba(l, x, y);
        const o = ((l * size + y) * size + x) * 4;
        for (let k = 0; k < 3; k++) linear[o + k] = toLinear(Math.min(1, Math.max(0, c[k]!)));
        linear[o + 3] = c[3];
      }
    }
  }
  const mips: Uint8Array<ArrayBuffer>[] = [];
  for (;;) {
    const bytes = new Uint8Array(size * size * layers * 4);
    for (let i = 0; i < size * size * layers; i++) {
      for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(toSrgb(linear[i * 4 + k]!) * 255);
      bytes[i * 4 + 3] = Math.round(linear[i * 4 + 3]! * 255);
    }
    mips.push(bytes);
    if (size === 1) break;
    const half = size / 2;
    const next = new Float32Array(half * half * layers * 4);
    for (let l = 0; l < layers; l++) {
      for (let y = 0; y < half; y++) {
        for (let x = 0; x < half; x++) {
          // Colour is averaged over covered texels only, so cutout edges do not darken in the mips.
          let wsum = 0;
          const acc = [0, 0, 0, 0];
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const o = ((l * size + y * 2 + dy) * size + x * 2 + dx) * 4;
              const w = Math.max(linear[o + 3]!, 1e-3);
              for (let k = 0; k < 3; k++) acc[k]! += linear[o + k]! * w;
              acc[3]! += linear[o + 3]!;
              wsum += w;
            }
          }
          const o = ((l * half + y) * half + x) * 4;
          for (let k = 0; k < 3; k++) next[o + k] = acc[k]! / wsum;
          next[o + 3] = acc[3]! / 4;
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
