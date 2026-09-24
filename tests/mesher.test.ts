import { describe, expect, it } from 'vitest';
import { BLOCK_TYPE_COUNT, BlockType, isFaceVisible } from '../src/world/block';
import { CHUNK_SIZE, SELF_NEIGHBOR_INDEX, neighborIndex } from '../src/world/coords';
import {
  FACE_NORMALS,
  PADDED_SIZE,
  PADDED_VOLUME,
  packVertex,
  paddedIndex,
  unpackVertex,
  type UnpackedVertex,
} from '../src/world/mesh-format';
import { buildPaddedVolume, greedyMesh, paddedFromSingleChunk, type MeshResult } from '../src/world/mesher';
import { PalettedChunk } from '../src/world/palette-chunk';
import { generateChunkDense } from '../src/world/terrain';
import { mulberry32 } from './helpers';

function volume(fill: (x: number, y: number, z: number) => number): Uint8Array {
  const v = new Uint8Array(PADDED_VOLUME);
  for (let z = -1; z <= CHUNK_SIZE; z++) {
    for (let y = -1; y <= CHUNK_SIZE; y++) {
      for (let x = -1; x <= CHUNK_SIZE; x++) v[paddedIndex(x + 1, y + 1, z + 1)] = fill(x, y, z);
    }
  }
  return v;
}

function quads(result: MeshResult): UnpackedVertex[][] {
  const out: UnpackedVertex[][] = [];
  for (const list of [result.opaque, result.water, result.cutout]) {
    for (let q = 0; q < list.length / 4; q++) {
      out.push([0, 1, 2, 3].map((k) => unpackVertex(list[q * 4 + k]!, { x: 0, y: 0, z: 0, face: 0, ao: 0, block: 0 })));
    }
  }
  return out;
}

/** Brute-force count of visible faces per direction (what the greedy mesh must cover exactly). */
function naiveFaceCount(padded: Uint8Array): number {
  let n = 0;
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const b = padded[paddedIndex(x + 1, y + 1, z + 1)]!;
        FACE_NORMALS.forEach(([dx, dy, dz], dir) => {
          if (isFaceVisible(b, padded[paddedIndex(x + 1 + dx, y + 1 + dy, z + 1 + dz)]!, dir)) n++;
        });
      }
    }
  }
  return n;
}

function quadArea(q: UnpackedVertex[]): number {
  const xs = q.map((v) => v.x), ys = q.map((v) => v.y), zs = q.map((v) => v.z);
  const ex = Math.max(...xs) - Math.min(...xs), ey = Math.max(...ys) - Math.min(...ys), ez = Math.max(...zs) - Math.min(...zs);
  return [ex, ey, ez].filter((e) => e > 0).reduce((a, b) => a * b, 1);
}

/**
 * Checks the invariants every mesh must satisfy: consistent quads inside the chunk, CCW winding
 * seen from outside, AO-aware diagonal choice, and exact single coverage of every visible face.
 * Violations are collected and asserted once (per-vertex expect() calls are far too slow).
 */
function checkMeshInvariants(padded: Uint8Array, result: MeshResult): void {
  const problems: string[] = [];
  const coverage = new Map<number, number>();
  let area = 0;
  for (const q of quads(result)) {
    const face = q[0]!.face;
    if (face >= 6) continue; // cross-plant quads are checked separately
    const [nx, ny, nz] = FACE_NORMALS[face]!;
    for (const v of q) {
      if (v.face !== face || v.block !== q[0]!.block) problems.push('inconsistent quad');
      if ([v.x, v.y, v.z].some((c) => c < 0 || c > CHUNK_SIZE)) problems.push('vertex out of bounds');
    }
    const [a, b, c, d] = q as [UnpackedVertex, UnpackedVertex, UnpackedVertex, UnpackedVertex];
    const e1 = [b.x - a.x, b.y - a.y, b.z - a.z], e2 = [c.x - a.x, c.y - a.y, c.z - a.z];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    if (n[0]! * nx! + n[1]! * ny! + n[2]! * nz! <= 0) problems.push(`clockwise quad on face ${face}`);
    if (a.ao + c.ao < b.ao + d.ao) problems.push('diagonal joins the darker corners');
    const min = [Math.min(a.x, b.x, c.x, d.x), Math.min(a.y, b.y, c.y, d.y), Math.min(a.z, b.z, c.z, d.z)];
    const max = [Math.max(a.x, b.x, c.x, d.x), Math.max(a.y, b.y, c.y, d.y), Math.max(a.z, b.z, c.z, d.z)];
    for (let x = min[0]!; x < Math.max(max[0]!, min[0]! + 1); x++) {
      for (let y = min[1]!; y < Math.max(max[1]!, min[1]! + 1); y++) {
        for (let z = min[2]!; z < Math.max(max[2]!, min[2]! + 1); z++) {
          const key = ((face * 64 + x) * 64 + y) * 64 + z;
          coverage.set(key, (coverage.get(key) ?? 0) + 1);
        }
      }
    }
    area += quadArea(q);
  }
  for (const count of coverage.values()) if (count !== 1) problems.push('overlapping quads');
  expect(problems.slice(0, 5)).toEqual([]);
  expect(area).toBe(naiveFaceCount(padded));
}

describe('vertex packing', () => {
  it('round-trips every field', () => {
    const v = unpackVertex(packVertex(32, 17, 5, 4, 2, BlockType.Basalt), { x: 0, y: 0, z: 0, face: 0, ao: 0, block: 0 });
    expect(v).toEqual({ x: 32, y: 17, z: 5, face: 4, ao: 2, block: BlockType.Basalt });
    expect(packVertex(32, 32, 32, 5, 3, 15)).toBeLessThan(2 ** 32);
  });
});

describe('greedy mesher', () => {
  it('emits 6 quads for a single block', () => {
    const padded = volume((x, y, z) => (x === 3 && y === 4 && z === 5 ? BlockType.Stone : BlockType.Air));
    const r = greedyMesh(padded);
    expect(r.opaqueQuads).toBe(6);
    expect(r.waterQuads).toBe(0);
    checkMeshInvariants(padded, r);
    for (const q of quads(r)) for (const v of q) expect(v.ao).toBe(3);
  });

  it('merges coplanar faces of identical blocks', () => {
    const padded = volume((x, y, z) => (y === 0 && x >= 2 && x < 10 && z >= 4 && z < 7 ? BlockType.Grass : BlockType.Air));
    const r = greedyMesh(padded);
    expect(r.opaqueQuads).toBe(6);
    checkMeshInvariants(padded, r);
  });

  it('does not merge faces of different block types', () => {
    const padded = volume((x, y, z) => (y === 0 && z === 0 && x >= 0 && x < 4 ? (x < 2 ? BlockType.Stone : BlockType.Dirt) : BlockType.Air));
    const r = greedyMesh(padded);
    // top/bottom/front/back split per type (4 × 2) + two end caps.
    expect(r.opaqueQuads).toBe(10);
    checkMeshInvariants(padded, r);
  });

  it('covers a full chunk with one quad per side and culls hidden faces', () => {
    const solid = volume((x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < 32 && y < 32 && z < 32 ? BlockType.Stone : BlockType.Air));
    const r = greedyMesh(solid);
    expect(r.opaqueQuads).toBe(6);
    checkMeshInvariants(solid, r);
    const buried = volume(() => BlockType.Stone);
    expect(greedyMesh(buried).opaqueQuads).toBe(0);
  });

  it('computes per-vertex ambient occlusion from the 26-neighbourhood', () => {
    // Block at (5,5,5) with an occluder diagonally above in +X: its top face corners at x=6
    // see one side occluder (AO 2), the corners at x=5 are open (AO 3).
    const padded = volume((x, y, z) =>
      (x === 5 && y === 5 && z === 5) || (x === 6 && y === 6 && z === 5) ? BlockType.Stone : BlockType.Air);
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    const top = quads(r).find((q) => q[0]!.face === 2 && q[0]!.y === 6 && q.every((v) => v.x <= 6 && v.x >= 5 && v.z >= 5 && v.z <= 6));
    expect(top).toBeDefined();
    for (const v of top!) expect(v.ao).toBe(v.x === 6 ? 2 : 3);
  });

  it('fully occludes corners enclosed by two side neighbours', () => {
    // Floor with walls on -X and -Z: the floor corner in the inner edge gets AO 0.
    const padded = volume((x, y, z) => (y === 0 || (y === 1 && (x === 0 || z === 0)) ? BlockType.Stone : BlockType.Air));
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    const aoAtCorner = quads(r)
      .filter((q) => q[0]!.face === 2 && q[0]!.y === 1)
      .flatMap((q) => q.filter((v) => v.x === 1 && v.z === 1).map((v) => v.ao));
    expect(aoAtCorner).toContain(0);
  });

  it('treats water as translucent: separate pool, culled against itself and opaque blocks', () => {
    // Stone floor at y=0, water from y=1 to y=3.
    const padded = volume((x, y, z) => {
      if (x < 0 || z < 0 || x >= 32 || z >= 32 || y < 0 || y >= 32) return BlockType.Air;
      return y === 0 ? BlockType.Stone : y <= 3 ? BlockType.Water : BlockType.Air;
    });
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    const water = quads({ ...r, opaque: new Uint32Array() });
    expect(water.every((q) => q[0]!.block === BlockType.Water)).toBe(true);
    // Water faces: top plane + 4 sides (against air); none against the stone below.
    expect(r.waterQuads).toBe(5);
    expect(water.some((q) => q[0]!.face === 3)).toBe(false);
    // Stone: its top face is visible through the water, bottom and 4 sides against air.
    expect(r.opaqueQuads).toBe(6);
  });

  it('meshes glass into the cutout pool, merging glass panes and culling faces between them', () => {
    const padded = volume((x, y, z) => (y === 5 && z === 5 && x >= 3 && x < 6 ? BlockType.Glass : BlockType.Air));
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    expect(r.opaqueQuads).toBe(0);
    expect(r.cutoutQuads).toBe(6); // a 3×1×1 bar: no faces between glass blocks
    expect(quads({ ...r, opaque: new Uint32Array(), water: new Uint32Array() }).every((q) => q[0]!.block === BlockType.Glass)).toBe(true);
  });

  it('draws opaque faces behind glass and plants (they do not occlude)', () => {
    const padded = volume((x, y, z) => {
      if (y === 0 && x >= 0 && z >= 0 && x < 32 && z < 32) return BlockType.Grass;
      if (y === 1 && x === 4 && z === 4) return BlockType.Glass;
      if (y === 1 && x === 8 && z === 8) return BlockType.TallGrass;
      return BlockType.Air;
    });
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    // The grass top under the glass block and under the plant is still emitted (area check),
    // and neither affects ambient occlusion of the ground.
    const tops = quads(r).filter((q) => q[0]!.block === BlockType.Grass && q[0]!.face === 2);
    expect(tops.every((q) => q.every((v) => v.ao === 3))).toBe(true);
  });

  it('emits two crossed double quads per plant', () => {
    const padded = volume((x, y, z) => (x === 2 && y === 3 && z === 4 ? BlockType.RedFlower : BlockType.Air));
    const r = greedyMesh(padded);
    expect(r.opaqueQuads + r.waterQuads).toBe(0);
    expect(r.cutoutQuads).toBe(2);
    const [a, b] = quads(r);
    expect(a!.map((v) => v.face)).toEqual([6, 6, 6, 6]);
    expect(b!.map((v) => v.face)).toEqual([7, 7, 7, 7]);
    for (const q of [a!, b!]) {
      for (const v of q) {
        expect(v.block).toBe(BlockType.RedFlower);
        expect([2, 3]).toContain(v.x);
        expect([3, 4]).toContain(v.y);
        expect([4, 5]).toContain(v.z);
      }
    }
    // Diagonals: quad A spans x = z (+2 offset), quad B spans x + z = const.
    expect(a!.every((v) => v.x - v.z === -2)).toBe(true);
    expect(b!.every((v) => v.x + v.z === 7)).toBe(true);
  });

  it('keeps water faces against plants visible', () => {
    const padded = volume((x, y, z) => (x === 5 && y === 5 && z === 5 ? BlockType.Water : x === 5 && y === 6 && z === 5 ? BlockType.TallGrass : BlockType.Air));
    const r = greedyMesh(padded);
    expect(r.waterQuads).toBe(6);
  });

  it('respects neighbour chunks through the padded border', () => {
    const solid = new PalettedChunk(BlockType.Stone);
    const neighbors: (PalettedChunk | null)[] = new Array(27).fill(null);
    neighbors[SELF_NEIGHBOR_INDEX] = solid;
    neighbors[neighborIndex(1, 0, 0)] = solid;
    neighbors[neighborIndex(0, 1, 0)] = solid;
    const padded = buildPaddedVolume(neighbors);
    expect(padded[paddedIndex(PADDED_SIZE - 1, 5, 5)]).toBe(BlockType.Stone);
    expect(padded[paddedIndex(0, 5, 5)]).toBe(BlockType.Air);
    const r = greedyMesh(padded);
    const faces = new Set(quads(r).map((q) => q[0]!.face));
    expect(faces).toEqual(new Set([1, 3, 4, 5])); // +X and +Y are hidden by the neighbours
    checkMeshInvariants(padded, r);
  });

  it('satisfies coverage/area invariants on random volumes', () => {
    const rand = mulberry32(2024);
    for (let trial = 0; trial < 4; trial++) {
      const density = 0.2 + trial * 0.2;
      const padded = volume(() => (rand() < density ? 1 + Math.floor(rand() * (BLOCK_TYPE_COUNT - 1)) : BlockType.Air));
      checkMeshInvariants(padded, greedyMesh(padded));
    }
  });

  it('meshes generated terrain and merges aggressively', () => {
    const chunk = PalettedChunk.fromDense(generateChunkDense(0, 0, 0, 1337));
    const padded = paddedFromSingleChunk(chunk);
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    const faces = naiveFaceCount(padded);
    expect(r.opaqueQuads + r.waterQuads).toBeGreaterThan(0);
    expect(r.opaqueQuads + r.waterQuads).toBeLessThan(faces);
  });
});

describe('greedy mesher lighting', () => {
  const floor = (_x: number, y: number) => (y === 0 ? BlockType.Stone : BlockType.Air);
  const topQuads = (r: MeshResult) => {
    const out: { verts: UnpackedVertex[]; light: number }[] = [];
    for (let q = 0; q < r.opaqueQuads; q++) {
      const verts = [0, 1, 2, 3].map((k) => unpackVertex(r.opaque[q * 4 + k]!, { x: 0, y: 0, z: 0, face: 0, ao: 0, block: 0 }));
      if (verts[0]!.face === 2) out.push({ verts, light: r.opaqueLight[q]! });
    }
    return out;
  };

  it('stores one light word per quad and merges uniformly lit faces', () => {
    const padded = volume(floor);
    const light = new Uint8Array(PADDED_VOLUME).fill(0xf0);
    const r = greedyMesh(padded, light);
    expect(r.opaqueLight).toHaveLength(r.opaqueQuads);
    expect(r.cutoutLight).toHaveLength(r.cutoutQuads);
    const tops = topQuads(r);
    expect(tops).toHaveLength(1);
    expect(tops[0]!.light).toBe(0xf0f0f0f0);
  });

  it('smooths light per corner and splits quads where light changes', () => {
    const padded = volume(floor);
    // Block light 15 at x < 16 and 5 beyond, sky 0 everywhere.
    const light = volume((x) => (x < 16 ? 15 : 5));
    const r = greedyMesh(padded, light);
    const tops = topQuads(r);
    expect(tops.length).toBeGreaterThan(1);
    const bytes = (w: number) => [0, 1, 2, 3].map((k) => (w >>> (k * 8)) & 0xff);
    for (const { verts, light: word } of tops) {
      bytes(word).forEach((b, k) => {
        const v = verts[k]!;
        // Corners at x = 16 see two voxels of each side: mean of 15 and 5 = 10.
        const expected = v.x < 16 ? 15 : v.x === 16 ? 10 : 5;
        expect(b >> 4, 'sky').toBe(0);
        expect(b & 15, `block light at x=${v.x}`).toBe(expected);
      });
    }
  });

  it('gives cross plants and torches the light of their own voxel', () => {
    const padded = volume((x, y, z) => (y === 0 ? BlockType.Stone : x === 4 && y === 1 && z === 4 ? BlockType.Torch : BlockType.Air));
    const light = volume((x, y, z) => (x === 4 && y === 1 && z === 4 ? 0x3e : 0));
    const r = greedyMesh(padded, light);
    expect(r.cutoutQuads).toBe(2);
    expect([...r.cutoutLight]).toEqual([0x3e3e3e3e, 0x3e3e3e3e]);
  });
});

describe('flowing water faces', () => {
  it('draws the step between a source and lower flowing water, but not the reverse', () => {
    expect(isFaceVisible(BlockType.Water, BlockType.WaterFlow2, 0)).toBe(true);
    expect(isFaceVisible(BlockType.WaterFlow2, BlockType.Water, 1)).toBe(false);
    expect(isFaceVisible(BlockType.WaterFlow1, BlockType.WaterFlow3, 4)).toBe(true);
    expect(isFaceVisible(BlockType.WaterFlow3, BlockType.WaterFlow3, 4)).toBe(false);
    // Never between vertically stacked water.
    expect(isFaceVisible(BlockType.Water, BlockType.WaterFlow7, 3)).toBe(false);
    expect(isFaceVisible(BlockType.WaterFalling, BlockType.WaterFlow4, 0)).toBe(true);
  });

  it('shows the lowered top of flowing water under a solid block, never of a full source', () => {
    expect(isFaceVisible(BlockType.WaterFlow3, BlockType.Stone, 2)).toBe(true);
    expect(isFaceVisible(BlockType.Water, BlockType.Stone, 2)).toBe(false);
    expect(isFaceVisible(BlockType.WaterFlow3, BlockType.Stone, 0)).toBe(false);
  });

  it('meshes a flowing stream into the water pool', () => {
    const padded = volume((x, y) => (y === 0 ? BlockType.Stone : y === 1 && x < 8 ? (x === 0 ? BlockType.Water : BlockType.WaterFlow1 + x - 1) : BlockType.Air));
    const r = greedyMesh(padded);
    checkMeshInvariants(padded, r);
    const blocks = new Set(quads(r).filter((q) => q[0]!.face < 6 && r.water.length > 0).map((q) => q[0]!.block));
    for (let level = 1; level <= 7; level++) expect(blocks.has(BlockType.WaterFlow1 + level - 1)).toBe(true);
  });
});
