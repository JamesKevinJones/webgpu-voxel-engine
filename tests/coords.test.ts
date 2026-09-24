import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  CHUNK_VOLUME,
  SELF_NEIGHBOR_INDEX,
  chunkKey,
  chunkToWorld,
  decodeChunkKey,
  indexToLocal,
  isLocalInBounds,
  localIndex,
  neighborIndex,
  neighborOffset,
  resolveNeighbor,
  worldToChunk,
  worldToLocal,
  type NeighborLocation,
} from '../src/world/coords';

describe('world ↔ chunk ↔ local coordinates', () => {
  it('maps world coordinates to chunk and local coordinates, including negatives', () => {
    expect(worldToChunk(0)).toBe(0);
    expect(worldToChunk(31)).toBe(0);
    expect(worldToChunk(32)).toBe(1);
    expect(worldToChunk(-1)).toBe(-1);
    expect(worldToChunk(-32)).toBe(-1);
    expect(worldToChunk(-33)).toBe(-2);
    expect(worldToLocal(0)).toBe(0);
    expect(worldToLocal(31)).toBe(31);
    expect(worldToLocal(32)).toBe(0);
    expect(worldToLocal(-1)).toBe(31);
    expect(worldToLocal(-32)).toBe(0);
    expect(worldToLocal(-33)).toBe(31);
  });

  it('floors fractional world positions to the containing voxel', () => {
    expect(worldToChunk(31.999)).toBe(0);
    expect(worldToChunk(-0.001)).toBe(-1);
    expect(worldToLocal(-0.5)).toBe(31);
    expect(worldToLocal(5.75)).toBe(5);
  });

  it('round-trips world = chunk * 32 + local for a wide range', () => {
    for (let w = -5000; w <= 5000; w += 7) {
      const c = worldToChunk(w);
      const l = worldToLocal(w);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThan(CHUNK_SIZE);
      expect(chunkToWorld(c) + l).toBe(w);
    }
  });

  it('round-trips every local index and orders x fastest', () => {
    const p = { x: 0, y: 0, z: 0 };
    const seen = new Uint8Array(CHUNK_VOLUME);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const i = localIndex(x, y, z);
          expect(i).toBe(x + y * 32 + z * 1024);
          seen[i]!++;
          indexToLocal(i, p);
          expect(p).toEqual({ x, y, z });
        }
      }
    }
    expect(seen.every((v) => v === 1)).toBe(true);
  });

  it('checks local bounds', () => {
    expect(isLocalInBounds(0, 0, 0)).toBe(true);
    expect(isLocalInBounds(31, 31, 31)).toBe(true);
    expect(isLocalInBounds(-1, 0, 0)).toBe(false);
    expect(isLocalInBounds(0, 32, 0)).toBe(false);
  });
});

describe('chunk keys', () => {
  it('round-trips chunk coordinates through numeric keys', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (const [x, y, z] of [[0, 0, 0], [-1, -1, -1], [1, -2, 3], [32767, -32768, 12], [-32768, 32767, -32768], [1234, -5, -4321]] as const) {
      const key = chunkKey(x, y, z);
      expect(Number.isSafeInteger(key)).toBe(true);
      expect(decodeChunkKey(key, out)).toEqual({ x, y, z });
    }
  });

  it('gives distinct keys to all neighbours of a chunk', () => {
    const keys = new Set<number>();
    for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) keys.add(chunkKey(dx - 1, dy, dz + 1));
    expect(keys.size).toBe(125);
  });
});

describe('neighbour lookups', () => {
  it('indexes the 27-neighbourhood consistently', () => {
    expect(SELF_NEIGHBOR_INDEX).toBe(neighborIndex(0, 0, 0));
    const o = { x: 0, y: 0, z: 0 };
    const seen = new Set<number>();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = neighborIndex(dx, dy, dz);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(27);
          seen.add(i);
          expect(neighborOffset(i, o)).toEqual({ x: dx, y: dy, z: dz });
        }
      }
    }
    expect(seen.size).toBe(27);
  });

  it('resolves out-of-chunk local coordinates to the owning neighbour', () => {
    const loc: NeighborLocation = { dx: 0, dy: 0, dz: 0, lx: 0, ly: 0, lz: 0 };
    expect(resolveNeighbor(5, 6, 7, loc)).toEqual({ dx: 0, dy: 0, dz: 0, lx: 5, ly: 6, lz: 7 });
    expect(resolveNeighbor(-1, 0, 31, loc)).toEqual({ dx: -1, dy: 0, dz: 0, lx: 31, ly: 0, lz: 31 });
    expect(resolveNeighbor(32, -1, 32, loc)).toEqual({ dx: 1, dy: -1, dz: 1, lx: 0, ly: 31, lz: 0 });
  });

  it('agrees with global world coordinates for every border voxel', () => {
    const loc: NeighborLocation = { dx: 0, dy: 0, dz: 0, lx: 0, ly: 0, lz: 0 };
    const [cx, cy, cz] = [-3, 2, 7];
    for (let l = -1; l <= CHUNK_SIZE; l++) {
      resolveNeighbor(l, CHUNK_SIZE - 1 - l, -1, loc);
      const wx = cx * 32 + l, wy = cy * 32 + (CHUNK_SIZE - 1 - l), wz = cz * 32 - 1;
      expect(cx + loc.dx).toBe(worldToChunk(wx));
      expect(cy + loc.dy).toBe(worldToChunk(wy));
      expect(cz + loc.dz).toBe(worldToChunk(wz));
      expect([loc.lx, loc.ly, loc.lz]).toEqual([worldToLocal(wx), worldToLocal(wy), worldToLocal(wz)]);
    }
  });
});
