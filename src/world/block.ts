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
} as const;

export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/** Number of defined block types. */
export const BLOCK_TYPE_COUNT = 10;

/**
 * Upper bound on block ids that fit the GPU voxel encoding (4 bits per palette index,
 * 16 palette entries per chunk). Palettes never exceed this because entries are reused.
 */
export const MAX_GPU_PALETTE = 16;

export const BLOCK_NAMES: readonly string[] = ['Air', 'Stone', 'Dirt', 'Grass', 'Sand', 'Water', 'Basalt', 'Wood', 'Leaves', 'Bedrock'];

/** Opaque blocks hide faces behind them and contribute to ambient occlusion. */
export function isOpaque(block: number): boolean {
  return block !== BlockType.Air && block !== BlockType.Water;
}

/** Blocks that are drawn in the alpha-blended pass. */
export function isTranslucent(block: number): boolean {
  return block === BlockType.Water;
}

/** Blocks the player cannot break. */
export function isUnbreakable(block: number): boolean {
  return block === BlockType.Bedrock;
}

/** Blocks a ray can hit / the player can target. */
export function isSolid(block: number): boolean {
  return isOpaque(block);
}

/**
 * Face visibility rule shared by the CPU reference mesher and `mesh.wgsl`:
 * opaque faces are drawn against anything non-opaque, water only against air.
 */
export function isFaceVisible(block: number, neighbor: number): boolean {
  if (block === BlockType.Air) return false;
  if (isOpaque(block)) return !isOpaque(neighbor);
  return neighbor === BlockType.Air;
}
