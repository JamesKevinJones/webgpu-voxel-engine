/** Block identifiers. Values are stable: they are baked into GPU buffers and shaders. */
export const BlockType = {
  Air: 0,
  Stone: 1,
  Dirt: 2,
  Grass: 3,
  Sand: 4,
  Water: 5,
  Basalt: 6,
  Wood: 7,
  Leaves: 8,
  Bedrock: 9,
  Sandstone: 10,
  Snow: 11,
  Ice: 12,
  Cactus: 13,
  BirchWood: 14,
  PineWood: 15,
  PineLeaves: 16,
  Glass: 17,
  Cobblestone: 18,
  Brick: 19,
  TallGrass: 20,
  RedFlower: 21,
  YellowFlower: 22,
  Torch: 23,
  /** Flowing water, 1..7 steps away from the nearest source (surface drops with distance). */
  WaterFlow1: 24,
  WaterFlow2: 25,
  WaterFlow3: 26,
  WaterFlow4: 27,
  WaterFlow5: 28,
  WaterFlow6: 29,
  WaterFlow7: 30,
  /** Flowing water with water directly above it (a waterfall column; full height). */
  WaterFalling: 31,
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/** Number of defined block types (ids 0..31: exactly the 5 bits of block id in packed vertices). */
export const BLOCK_TYPE_COUNT = 32;

/** Farthest horizontal spread of flowing water from a source or a waterfall. */
export const MAX_WATER_LEVEL = 7;

/**
 * Upper bound on block ids that fit the GPU encodings: 8-bit palette indices with a 32-entry
 * per-chunk palette, and 5 bits of block id in packed vertices. Palettes never exceed this
 * because entries are recycled.
 */
export const MAX_GPU_PALETTE = 32;

/**
 * How a block is drawn:
 *  - opaque:  greedy-meshed cube faces in the opaque pass, occludes neighbours and AO
 *  - water:   greedy-meshed faces in the alpha-blended water pass
 *  - cutout:  greedy-meshed cube faces drawn with alpha testing (glass)
 *  - cross:   two crossed quads per voxel drawn with alpha testing (tall grass, flowers)
 */
export type RenderClass = 'none' | 'opaque' | 'water' | 'cutout' | 'cross';

interface BlockInfo {
  name: string;
  render: RenderClass;
  /** Blocks player movement. */
  solid: boolean;
  /** Seconds of mining to break (Infinity = unbreakable, 0 = instant). */
  hardness: number;
  /** Light level (0..15) emitted into the block-light channel. */
  emission?: number;
}

const FLOWING_WATER: BlockInfo = { name: 'Flowing Water', render: 'water', solid: false, hardness: Infinity };

const INFO: readonly BlockInfo[] = [
  { name: 'Air', render: 'none', solid: false, hardness: 0 },
  { name: 'Stone', render: 'opaque', solid: true, hardness: 1.2 },
  { name: 'Dirt', render: 'opaque', solid: true, hardness: 0.5 },
  { name: 'Grass', render: 'opaque', solid: true, hardness: 0.6 },
  { name: 'Sand', render: 'opaque', solid: true, hardness: 0.5 },
  { name: 'Water', render: 'water', solid: false, hardness: Infinity },
  { name: 'Basalt', render: 'opaque', solid: true, hardness: 1.6 },
  { name: 'Oak Log', render: 'opaque', solid: true, hardness: 0.9 },
  { name: 'Leaves', render: 'opaque', solid: true, hardness: 0.2 },
  { name: 'Bedrock', render: 'opaque', solid: true, hardness: Infinity },
  { name: 'Sandstone', render: 'opaque', solid: true, hardness: 0.9 },
  { name: 'Snow', render: 'opaque', solid: true, hardness: 0.3 },
  { name: 'Ice', render: 'opaque', solid: true, hardness: 0.5 },
  { name: 'Cactus', render: 'opaque', solid: true, hardness: 0.4 },
  { name: 'Birch Log', render: 'opaque', solid: true, hardness: 0.9 },
  { name: 'Pine Log', render: 'opaque', solid: true, hardness: 0.9 },
  { name: 'Pine Needles', render: 'opaque', solid: true, hardness: 0.2 },
  { name: 'Glass', render: 'cutout', solid: true, hardness: 0.3 },
  { name: 'Cobblestone', render: 'opaque', solid: true, hardness: 1.4 },
  { name: 'Brick', render: 'opaque', solid: true, hardness: 1.4 },
  { name: 'Tall Grass', render: 'cross', solid: false, hardness: 0 },
  { name: 'Red Flower', render: 'cross', solid: false, hardness: 0 },
  { name: 'Yellow Flower', render: 'cross', solid: false, hardness: 0 },
  { name: 'Torch', render: 'cross', solid: false, hardness: 0, emission: 14 },
  FLOWING_WATER, FLOWING_WATER, FLOWING_WATER, FLOWING_WATER, FLOWING_WATER, FLOWING_WATER, FLOWING_WATER,
  { name: 'Falling Water', render: 'water', solid: false, hardness: Infinity },
];

export const BLOCK_NAMES: readonly string[] = INFO.map((b) => b.name);

function info(block: number): BlockInfo {
  return INFO[block] ?? INFO[0]!;
}

export function renderClass(block: number): RenderClass {
  return info(block).render;
}

/** Opaque blocks hide faces behind them and contribute to ambient occlusion. */
export function isOpaque(block: number): boolean {
  return info(block).render === 'opaque';
}

/** Blocks that are drawn in the alpha-blended pass. */
export function isTranslucent(block: number): boolean {
  return isWater(block);
}

/** Any water: sources, flowing levels and falling columns. */
export function isWater(block: number): boolean {
  return block === BlockType.Water || (block >= BlockType.WaterFlow1 && block <= BlockType.WaterFalling);
}

/**
 * Water level: 0 for sources and falling water, 1..7 for flowing water (distance from the
 * source), -1 for anything that is not water.
 */
export function waterLevel(block: number): number {
  if (block === BlockType.Water || block === BlockType.WaterFalling) return 0;
  if (block >= BlockType.WaterFlow1 && block <= BlockType.WaterFlow7) return block - BlockType.WaterFlow1 + 1;
  return -1;
}

/** Flowing-water block for level 1..7. */
export function flowingWater(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_WATER_LEVEL) throw new RangeError(`bad water level ${level}`);
  return BlockType.WaterFlow1 + level - 1;
}

/** Height of the water surface inside its cell in eighths (8 = full, 0 = not water). */
export function waterSurface(block: number): number {
  const level = waterLevel(block);
  return level < 0 ? 0 : 8 - level;
}

/** Light emitted into the block-light channel (torches). */
export function lightEmission(block: number): number {
  return info(block).emission ?? 0;
}

/** Blocks that flowing water may wash away (and that never stop it). */
export function isFluidReplaceable(block: number): boolean {
  return block === BlockType.Air || isCrossPlant(block);
}

/**
 * Light transport through a block: -1 blocks light completely, otherwise the extra attenuation
 * (on top of the 1 level lost per step). Leaves thin light out, water scatters it.
 */
export function lightAttenuation(block: number): number {
  if (block === BlockType.Leaves || block === BlockType.PineLeaves) return 1;
  return isOpaque(block) ? -1 : 0;
}

/** Whether full-strength (15) sunlight passes straight down through the block undiminished. */
export function passesSunbeam(block: number): boolean {
  return lightAttenuation(block) === 0 && !isWater(block);
}

/** Tall grass and flowers: no cube faces, drawn as crossed quads. */
export function isCrossPlant(block: number): boolean {
  return info(block).render === 'cross';
}

/** Blocks that stop the player. */
export function isSolid(block: number): boolean {
  return info(block).solid;
}

/** Blocks the crosshair can target: anything loaded but air and water (-1 = not generated yet). */
export function isTargetable(block: number): boolean {
  return block > BlockType.Air && !isWater(block);
}

/** Cells a placed block may overwrite: air, water and plants. */
export function isPlaceReplaceable(block: number): boolean {
  return block === BlockType.Air || isWater(block) || (isCrossPlant(block) && block !== BlockType.Torch);
}

/** Blocks the player cannot break. */
export function isUnbreakable(block: number): boolean {
  return !Number.isFinite(info(block).hardness);
}

/** Seconds of continuous mining needed to break a block. */
export function breakTime(block: number): number {
  return info(block).hardness;
}

/**
 * Face visibility rule shared by the CPU reference mesher and `mesh.wgsl` (`dir` is the face
 * direction 0..5, see mesh-format.ts):
 *  - opaque faces are drawn against anything non-opaque,
 *  - glass (cutout) faces against anything that is neither opaque nor glass,
 *  - water faces against air or plants; sideways against water with a lower surface (the step
 *    between flow levels); and the lowered top of flowing water under any non-water block,
 *  - plants never produce cube faces.
 */
export function isFaceVisible(block: number, neighbor: number, dir = 0): boolean {
  switch (info(block).render) {
    case 'opaque':
      return !isOpaque(neighbor);
    case 'cutout':
      return !isOpaque(neighbor) && neighbor !== block;
    case 'water':
      if (neighbor === BlockType.Air || isCrossPlant(neighbor)) return true;
      if (isWater(neighbor)) return dir !== 2 && dir !== 3 && waterSurface(neighbor) < waterSurface(block);
      return dir === 2 && waterSurface(block) < 8;
    default:
      return false;
  }
}
