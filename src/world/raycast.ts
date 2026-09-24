export interface RaycastHit {
  /** Voxel that was hit. */
  x: number;
  y: number;
  z: number;
  /** Normal of the entered face (points back towards the ray origin). */
  nx: number;
  ny: number;
  nz: number;
  /** Distance along the (normalised) ray to the entry point. */
  distance: number;
  block: number;
}

/**
 * Amanatides & Woo voxel traversal. Visits every voxel the ray passes through, in order,
 * and returns the first one for which `isHit(block)` holds.
 */
export function raycastVoxels(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDistance: number,
  getBlock: (x: number, y: number, z: number) => number,
  isHit: (block: number) => boolean,
): RaycastHit | null {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len; dy /= len; dz /= len;

  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;
  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  while (t <= maxDistance) {
    const block = getBlock(x, y, z);
    if (isHit(block)) return { x, y, z, nx, ny, nz, distance: t, block };
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}
