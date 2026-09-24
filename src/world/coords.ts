/**
 * Coordinate spaces
 * -----------------
 *  - World space: integer voxel coordinates (wx, wy, wz); fractional positions floor to the voxel.
 *  - Chunk coordinates: (cx, cy, cz) = floor(world / CHUNK_SIZE).
 *  - Local coordinates: (lx, ly, lz) in [0, CHUNK_SIZE), local index = lx | ly << 5 | lz << 10.
 *
 * X is the fastest varying axis so eight consecutive voxels along X share one 32-bit word
 * in the 4-bit GPU encoding.
 */
export const CHUNK_SHIFT = 5;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT; // 32
export const CHUNK_MASK = CHUNK_SIZE - 1;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_SIZE; // 32768

/** Chunk coordinate range encodable in a numeric chunk key (±32767 chunks ≈ ±1M voxels). */
export const CHUNK_KEY_BIAS = 32768;
const KEY_RANGE = 65536;

export interface IVec3 {
  x: number;
  y: number;
  z: number;
}

/** Converts a world coordinate (integer or fractional) to its chunk coordinate. */
export function worldToChunk(w: number): number {
  return Math.floor(Math.floor(w) / CHUNK_SIZE);
}

/** Converts a world coordinate to the local coordinate inside its chunk (always 0..31). */
export function worldToLocal(w: number): number {
  const i = Math.floor(w);
  return i - Math.floor(i / CHUNK_SIZE) * CHUNK_SIZE;
}

/** World coordinate of a chunk's minimum corner. */
export function chunkToWorld(c: number): number {
  return c * CHUNK_SIZE;
}

/** Local (lx,ly,lz) → flat voxel index. Coordinates must be in [0, 32). */
export function localIndex(lx: number, ly: number, lz: number): number {
  return lx | (ly << CHUNK_SHIFT) | (lz << (CHUNK_SHIFT * 2));
}

export function indexToLocal(index: number, out: IVec3): IVec3 {
  out.x = index & CHUNK_MASK;
  out.y = (index >> CHUNK_SHIFT) & CHUNK_MASK;
  out.z = index >> (CHUNK_SHIFT * 2);
  return out;
}

export function isLocalInBounds(lx: number, ly: number, lz: number): boolean {
  return lx >= 0 && ly >= 0 && lz >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE && lz < CHUNK_SIZE;
}

/** Packs chunk coordinates into a single float-safe integer key (48 bits). */
export function chunkKey(cx: number, cy: number, cz: number): number {
  return ((cx + CHUNK_KEY_BIAS) * KEY_RANGE + (cy + CHUNK_KEY_BIAS)) * KEY_RANGE + (cz + CHUNK_KEY_BIAS);
}

export function decodeChunkKey(key: number, out: IVec3): IVec3 {
  const z = key % KEY_RANGE;
  const rest = (key - z) / KEY_RANGE;
  const y = rest % KEY_RANGE;
  const x = (rest - y) / KEY_RANGE;
  out.x = x - CHUNK_KEY_BIAS;
  out.y = y - CHUNK_KEY_BIAS;
  out.z = z - CHUNK_KEY_BIAS;
  return out;
}

/** Index 0..26 of a neighbour offset (dx,dy,dz) in {-1,0,1}³; 13 is the chunk itself. */
export function neighborIndex(dx: number, dy: number, dz: number): number {
  return dx + 1 + (dy + 1) * 3 + (dz + 1) * 9;
}

export const SELF_NEIGHBOR_INDEX = 13;

export function neighborOffset(index: number, out: IVec3): IVec3 {
  out.x = (index % 3) - 1;
  out.y = (Math.floor(index / 3) % 3) - 1;
  out.z = Math.floor(index / 9) - 1;
  return out;
}

export interface NeighborLocation {
  /** Offset of the chunk that actually owns the voxel, each component in {-1,0,1}. */
  dx: number;
  dy: number;
  dz: number;
  /** Wrapped local coordinates inside that chunk. */
  lx: number;
  ly: number;
  lz: number;
}

/**
 * Resolves a local coordinate that may lie one voxel outside the chunk ([-1, 32])
 * to the owning neighbour chunk and the wrapped local coordinate inside it.
 */
export function resolveNeighbor(lx: number, ly: number, lz: number, out: NeighborLocation): NeighborLocation {
  out.dx = lx < 0 ? -1 : lx >= CHUNK_SIZE ? 1 : 0;
  out.dy = ly < 0 ? -1 : ly >= CHUNK_SIZE ? 1 : 0;
  out.dz = lz < 0 ? -1 : lz >= CHUNK_SIZE ? 1 : 0;
  out.lx = lx - out.dx * CHUNK_SIZE;
  out.ly = ly - out.dy * CHUNK_SIZE;
  out.lz = lz - out.dz * CHUNK_SIZE;
  return out;
}

/** Squared distance in chunk units between two chunk coordinates. */
export function chunkDistanceSq(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}
