import { CHUNK_SIZE } from './coords';

/**
 * Mesh data layout shared by the CPU reference mesher, `mesh.wgsl` and `terrain.wgsl`.
 *
 * Face directions: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z  (axis = dir >> 1, negative = dir & 1).
 * For axis a the face plane is spanned by u = (a+1) % 3 and v = (a+2) % 3, which gives
 * u × v = +a, so quads listed (0,0),(1,0),(1,1),(0,1) in (u,v) are counter-clockwise when
 * seen from the positive side.
 *
 * Packed vertex (one u32):
 *   bits  0..5   x   (0..32, local to the chunk)
 *   bits  6..11  y
 *   bits 12..17  z
 *   bits 18..20  face direction
 *   bits 21..22  ambient occlusion level (0 = fully occluded, 3 = open)
 *   bits 23..26  block id
 */
export const Face = { PosX: 0, NegX: 1, PosY: 2, NegY: 3, PosZ: 4, NegZ: 5 } as const;
export const FACE_COUNT = 6;

export const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export function packVertex(x: number, y: number, z: number, face: number, ao: number, block: number): number {
  return (x | (y << 6) | (z << 12) | (face << 18) | (ao << 21) | (block << 23)) >>> 0;
}

export interface UnpackedVertex {
  x: number;
  y: number;
  z: number;
  face: number;
  ao: number;
  block: number;
}

export function unpackVertex(v: number, out: UnpackedVertex): UnpackedVertex {
  out.x = v & 63;
  out.y = (v >>> 6) & 63;
  out.z = (v >>> 12) & 63;
  out.face = (v >>> 18) & 7;
  out.ao = (v >>> 21) & 3;
  out.block = (v >>> 23) & 15;
  return out;
}

export const VERTICES_PER_QUAD = 4;
export const INDICES_PER_QUAD = 6;
/** Static quad index pattern; the flip for AO anisotropy is done by rotating vertices instead. */
export const QUAD_INDEX_PATTERN: readonly number[] = [0, 1, 2, 0, 2, 3];

/** Per-chunk quad budgets of the fixed-size GPU mesh slots. */
export const OPAQUE_QUAD_CAPACITY = 6144;
export const WATER_QUAD_CAPACITY = 1024;
export const OPAQUE_VERTEX_CAPACITY = OPAQUE_QUAD_CAPACITY * VERTICES_PER_QUAD;
export const WATER_VERTEX_CAPACITY = WATER_QUAD_CAPACITY * VERTICES_PER_QUAD;

/** Padded voxel volume (chunk + 1 voxel border) consumed by the mesher; 8 bits per voxel. */
export const PADDED_SIZE = CHUNK_SIZE + 2;
export const PADDED_VOLUME = PADDED_SIZE * PADDED_SIZE * PADDED_SIZE;
export const PADDED_WORDS = Math.ceil(PADDED_VOLUME / 4);

export function paddedIndex(px: number, py: number, pz: number): number {
  return px + PADDED_SIZE * (py + PADDED_SIZE * pz);
}

/** Mesh job record (u32 words): [0] mesh slot, [1..3] reserved, [4..31) voxel slots of the 27 neighbours. */
export const MESH_JOB_WORDS = 32;
export const MESH_JOB_NEIGHBOR_OFFSET = 4;
/** Marker for "no voxel data" (unloaded or all-air chunk) in job neighbour tables. */
export const NO_SLOT = 0xffffffff;

/** drawIndexedIndirect argument record: indexCount, instanceCount, firstIndex, baseVertex, firstInstance. */
export const INDIRECT_ARGS_WORDS = 5;
export const INDIRECT_ARGS_BYTES = INDIRECT_ARGS_WORDS * 4;
/** Per-slot atomic counters: [0] opaque quads requested, [1] water quads requested. */
export const MESH_COUNTER_WORDS = 2;
