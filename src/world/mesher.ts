import { BlockType, isCrossPlant, isFaceVisible, isOpaque, renderClass } from './block';
import { CHUNK_SIZE, SELF_NEIGHBOR_INDEX, resolveNeighbor, neighborIndex, type NeighborLocation } from './coords';
import {
  FACE_COUNT,
  PADDED_SIZE,
  PADDED_VOLUME,
  packVertex,
  paddedIndex,
} from './mesh-format';

/** Minimal voxel source interface (PalettedChunk satisfies it). */
export interface VoxelSource {
  getLocal(lx: number, ly: number, lz: number): number;
}

/**
 * CPU mirror of `gather.wgsl`: expands a chunk and a one-voxel border taken from its 26
 * neighbours into a dense (34³) volume. Missing neighbours read as air.
 */
export function buildPaddedVolume(
  neighbors: readonly (VoxelSource | null | undefined)[],
  out: Uint8Array = new Uint8Array(PADDED_VOLUME),
): Uint8Array {
  const loc: NeighborLocation = { dx: 0, dy: 0, dz: 0, lx: 0, ly: 0, lz: 0 };
  for (let pz = 0; pz < PADDED_SIZE; pz++) {
    for (let py = 0; py < PADDED_SIZE; py++) {
      for (let px = 0; px < PADDED_SIZE; px++) {
        resolveNeighbor(px - 1, py - 1, pz - 1, loc);
        const src = neighbors[neighborIndex(loc.dx, loc.dy, loc.dz)];
        out[paddedIndex(px, py, pz)] = src ? src.getLocal(loc.lx, loc.ly, loc.lz) : BlockType.Air;
      }
    }
  }
  return out;
}

/** Convenience: padded volume for an isolated chunk surrounded by air. */
export function paddedFromSingleChunk(chunk: VoxelSource): Uint8Array {
  const n: (VoxelSource | null)[] = new Array(27).fill(null);
  n[SELF_NEIGHBOR_INDEX] = chunk;
  return buildPaddedVolume(n);
}

export interface MeshResult {
  opaque: Uint32Array;
  water: Uint32Array;
  /** Alpha-tested geometry: glass faces and cross-plant quads. */
  cutout: Uint32Array;
  opaqueQuads: number;
  waterQuads: number;
  cutoutQuads: number;
}

/** Face key layout: block id in bits 0..4, four 2-bit corner AO levels in bits 5..12. */
const KEY_AO_SHIFT = 5;
const AO_OPEN_KEY = 0xff << KEY_AO_SHIFT;

/**
 * CPU reference implementation of the GPU greedy mesher (`mesh.wgsl`), same algorithm:
 *  1. For every face direction and slice, compute a 32×32 mask of face keys
 *     (block id + 4 corner AO levels; faces merge only when keys match exactly).
 *  2. Per row, collapse the mask into maximal runs of identical keys.
 *  3. Per run-start column, merge vertically adjacent runs with identical start/length/key.
 */
export function greedyMesh(padded: Uint8Array): MeshResult {
  const opaque: number[] = [];
  const water: number[] = [];
  const cutout: number[] = [];
  const pools = { opaque, water, cutout };
  const runs = new Uint32Array(CHUNK_SIZE * CHUNK_SIZE);
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const sample = (x: number, y: number, z: number): number => padded[paddedIndex(x + 1, y + 1, z + 1)]!;
  const occ = (x: number, y: number, z: number): number => (isOpaque(sample(x, y, z)) ? 1 : 0);

  for (let dir = 0; dir < FACE_COUNT; dir++) {
    const a = dir >> 1;
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    const sign = dir & 1 ? -1 : 1;
    for (let s = 0; s < CHUNK_SIZE; s++) {
      // Phase 1: row runs.
      runs.fill(0);
      for (let j = 0; j < CHUNK_SIZE; j++) {
        let runKey = 0;
        let runStart = 0;
        for (let i = 0; i <= CHUNK_SIZE; i++) {
          let key = 0;
          if (i < CHUNK_SIZE) {
            p[a] = s; p[u] = i; p[v] = j;
            const block = sample(p[0]!, p[1]!, p[2]!);
            q[0] = p[0]!; q[1] = p[1]!; q[2] = p[2]!;
            q[a] = q[a]! + sign;
            const neighbor = sample(q[0]!, q[1]!, q[2]!);
            if (isFaceVisible(block, neighbor)) {
              key = block | (block === BlockType.Water ? AO_OPEN_KEY : aoKey(q, u, v, occ));
            }
          }
          if (key !== runKey) {
            if (runKey !== 0) runs[j * CHUNK_SIZE + runStart] = runKey | ((i - runStart) << 16);
            runKey = key;
            runStart = i;
          }
        }
      }
      // Phase 2: vertical merge of identical runs.
      for (let i = 0; i < CHUNK_SIZE; i++) {
        let open = 0;
        let startJ = 0;
        for (let j = 0; j <= CHUNK_SIZE; j++) {
          const r = j < CHUNK_SIZE ? runs[j * CHUNK_SIZE + i]! : 0;
          if (open !== 0 && r === open) continue;
          if (open !== 0) emitQuad(dir, s, i, startJ, open >>> 16, j - startJ, open & 0xffff, pools);
          open = r;
          startJ = j;
        }
      }
    }
  }
  // Cross plants: two diagonal quads per voxel (drawn double-sided with alpha testing).
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = sample(x, y, z);
        if (isCrossPlant(block)) emitCross(x, y, z, block, cutout);
      }
    }
  }
  return {
    opaque: Uint32Array.from(opaque),
    water: Uint32Array.from(water),
    cutout: Uint32Array.from(cutout),
    opaqueQuads: opaque.length / 4,
    waterQuads: water.length / 4,
    cutoutQuads: cutout.length / 4,
  };
}

/** Emits the two crossed quads of a plant at (x, y, z): faces 6 (x = z plane) and 7 (x = 1 - z). */
export function emitCross(x: number, y: number, z: number, block: number, out: number[]): void {
  out.push(
    packVertex(x, y, z, 6, 3, block), packVertex(x + 1, y, z + 1, 6, 3, block),
    packVertex(x + 1, y + 1, z + 1, 6, 3, block), packVertex(x, y + 1, z, 6, 3, block),
    packVertex(x + 1, y, z, 7, 3, block), packVertex(x, y, z + 1, 7, 3, block),
    packVertex(x, y + 1, z + 1, 7, 3, block), packVertex(x + 1, y + 1, z, 7, 3, block),
  );
}

/** Corner AO for the face whose outside cell is q. Corner order: (0,0) (1,0) (1,1) (0,1) in (u,v). */
function aoKey(q: number[], u: number, v: number, occ: (x: number, y: number, z: number) => number): number {
  let key = 0;
  const c = [0, 0, 0];
  for (let corner = 0; corner < 4; corner++) {
    const du = corner === 1 || corner === 2 ? 1 : -1;
    const dv = corner >= 2 ? 1 : -1;
    c[0] = q[0]!; c[1] = q[1]!; c[2] = q[2]!;
    c[u] = c[u]! + du;
    const side1 = occ(c[0]!, c[1]!, c[2]!);
    c[u] = q[u]!;
    c[v] = c[v]! + dv;
    const side2 = occ(c[0]!, c[1]!, c[2]!);
    c[u] = c[u]! + du;
    const cornerOcc = occ(c[0]!, c[1]!, c[2]!);
    const ao = side1 && side2 ? 0 : 3 - (side1 + side2 + cornerOcc);
    key |= ao << (KEY_AO_SHIFT + corner * 2);
  }
  return key;
}

function emitQuad(
  dir: number,
  s: number,
  i: number,
  j: number,
  w: number,
  h: number,
  key: number,
  pools: { opaque: number[]; water: number[]; cutout: number[] },
): void {
  const a = dir >> 1;
  const u = (a + 1) % 3;
  const v = (a + 2) % 3;
  const negative = (dir & 1) === 1;
  const block = key & 31;
  const ao = [0, 1, 2, 3].map((c) => (key >> (KEY_AO_SHIFT + c * 2)) & 3);
  const plane = negative ? s : s + 1;
  // Corner indices into the (u,v) corner table (0,0) (1,0) (1,1) (0,1).
  const order = negative ? [0, 3, 2, 1] : [0, 1, 2, 3];
  // Flip the shared diagonal when the other one is brighter (removes AO interpolation anisotropy).
  const flip = ao[0]! + ao[2]! < ao[1]! + ao[3]!;
  const cls = renderClass(block);
  const out = cls === 'water' ? pools.water : cls === 'cutout' ? pools.cutout : pools.opaque;
  const pos = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const corner = order[(k + (flip ? 1 : 0)) & 3]!;
    const cu = corner === 1 || corner === 2 ? 1 : 0;
    const cv = corner >= 2 ? 1 : 0;
    pos[a] = plane;
    pos[u] = i + cu * w;
    pos[v] = j + cv * h;
    out.push(packVertex(pos[0]!, pos[1]!, pos[2]!, dir, ao[corner]!, block));
  }
}
