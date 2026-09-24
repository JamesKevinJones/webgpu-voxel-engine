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
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/** Number of defined block types. */
export const BLOCK_TYPE_COUNT = 23;

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
}

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
  return block === BlockType.Water;
}

/** Tall grass and flowers: no cube faces, drawn as crossed quads. */
export function isCrossPlant(block: number): boolean {
  return info(block).render === 'cross';
}

/** Blocks that stop the player. */
export function isSolid(block: number): boolean {
  return info(block).solid;
}

/** Blocks the crosshair can target (anything but air and water). */
export function isTargetable(block: number): boolean {
  return block !== BlockType.Air && block !== BlockType.Water;
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
 * Face visibility rule shared by the CPU reference mesher and `mesh.wgsl`:
 *  - opaque faces are drawn against anything non-opaque,
 *  - glass (cutout) faces against anything that is neither opaque nor glass,
 *  - water faces only against air or plants,
 *  - plants never produce cube faces.
 */
export function isFaceVisible(block: number, neighbor: number): boolean {
  switch (info(block).render) {
    case 'opaque':
      return !isOpaque(neighbor);
    case 'cutout':
      return !isOpaque(neighbor) && neighbor !== block;
    case 'water':
      return neighbor === BlockType.Air || isCrossPlant(neighbor);
    default:
      return false;
  }
}
