/**
 * Axis-aligned boxes swept against the unit voxel grid.
 *
 * Movement is resolved one axis at a time (Y, then X, then Z). Each axis is a continuous sweep:
 * every voxel layer between the box's leading face and its destination is tested, so no speed
 * can tunnel through a wall, and faces that merely touch never count as overlapping.
 */
export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Returns true when the voxel at integer coordinates blocks movement. */
export type SolidQuery = (x: number, y: number, z: number) => boolean;

/** Faces closer than this are treated as touching, not overlapping. */
export const COLLISION_EPSILON = 1e-5;

export type Axis = 0 | 1 | 2;

export function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function lo(box: Aabb, axis: Axis): number {
  return axis === 0 ? box.minX : axis === 1 ? box.minY : box.minZ;
}

function hi(box: Aabb, axis: Axis): number {
  return axis === 0 ? box.maxX : axis === 1 ? box.maxY : box.maxZ;
}

export function translate(box: Aabb, axis: Axis, delta: number): void {
  if (axis === 0) { box.minX += delta; box.maxX += delta; }
  else if (axis === 1) { box.minY += delta; box.maxY += delta; }
  else { box.minZ += delta; box.maxZ += delta; }
}

/** Whether any solid voxel overlaps the box (touching faces excluded). */
export function intersectsSolid(box: Aabb, solid: SolidQuery): boolean {
  const x0 = Math.floor(box.minX + COLLISION_EPSILON), x1 = Math.ceil(box.maxX - COLLISION_EPSILON) - 1;
  const y0 = Math.floor(box.minY + COLLISION_EPSILON), y1 = Math.ceil(box.maxY - COLLISION_EPSILON) - 1;
  const z0 = Math.floor(box.minZ + COLLISION_EPSILON), z1 = Math.ceil(box.maxZ - COLLISION_EPSILON) - 1;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
    }
  }
  return false;
}

/**
 * Sweeps `box` along one axis by `delta` and returns the distance it can travel before touching a
 * solid voxel (same sign as delta, |result| ≤ |delta|). The box itself is not modified.
 */
export function sweepAxis(box: Aabb, axis: Axis, delta: number, solid: SolidQuery): number {
  if (delta === 0) return 0;
  const b: Axis = ((axis + 1) % 3) as Axis;
  const c: Axis = ((axis + 2) % 3) as Axis;
  const b0 = Math.floor(lo(box, b) + COLLISION_EPSILON), b1 = Math.ceil(hi(box, b) - COLLISION_EPSILON) - 1;
  const c0 = Math.floor(lo(box, c) + COLLISION_EPSILON), c1 = Math.ceil(hi(box, c) - COLLISION_EPSILON) - 1;
  const layerSolid = (i: number): boolean => {
    for (let u = b0; u <= b1; u++) {
      for (let v = c0; v <= c1; v++) {
        // (axis, b, c) is a cyclic permutation of (x, y, z).
        const hit = axis === 0 ? solid(i, u, v) : axis === 1 ? solid(v, i, u) : solid(u, v, i);
        if (hit) return true;
      }
    }
    return false;
  };
  if (delta > 0) {
    const face = hi(box, axis);
    const first = Math.ceil(face - COLLISION_EPSILON);
    const last = Math.ceil(face + delta) - 1;
    for (let i = first; i <= last; i++) {
      if (layerSolid(i)) return Math.max(0, Math.min(delta, i - face));
    }
  } else {
    const face = lo(box, axis);
    const first = Math.floor(face + COLLISION_EPSILON) - 1;
    const last = Math.floor(face + delta);
    for (let i = first; i >= last; i--) {
      if (layerSolid(i)) return Math.min(0, Math.max(delta, i + 1 - face));
    }
  }
  return delta;
}

export interface MoveResult {
  dx: number;
  dy: number;
  dz: number;
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
}

/** Moves `box` in place by up to (dx, dy, dz), resolving Y first, then X, then Z. */
export function moveBox(box: Aabb, dx: number, dy: number, dz: number, solid: SolidQuery): MoveResult {
  const ry = sweepAxis(box, 1, dy, solid);
  translate(box, 1, ry);
  const rx = sweepAxis(box, 0, dx, solid);
  translate(box, 0, rx);
  const rz = sweepAxis(box, 2, dz, solid);
  translate(box, 2, rz);
  return { dx: rx, dy: ry, dz: rz, hitX: rx !== dx, hitY: ry !== dy, hitZ: rz !== dz };
}
