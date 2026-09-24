import { describe, expect, it } from 'vitest';
import { isSolid } from '../src/world/block';
import { raycastVoxels } from '../src/world/raycast';

const world = (solid: Set<string>) => (x: number, y: number, z: number) => (solid.has(`${x},${y},${z}`) ? 1 : 0);

describe('raycastVoxels', () => {
  it('hits the first solid voxel along an axis and reports the entered face', () => {
    const hit = raycastVoxels(0.5, 0.5, 0.5, 1, 0, 0, 20, world(new Set(['5,0,0', '7,0,0'])), isSolid)!;
    expect([hit.x, hit.y, hit.z]).toEqual([5, 0, 0]);
    expect([hit.nx, hit.ny, hit.nz]).toEqual([-1, 0, 0]);
    expect(hit.distance).toBeCloseTo(4.5);
  });

  it('works in negative directions and coordinates', () => {
    const hit = raycastVoxels(-0.5, 10.2, -3.5, 0, -1, 0, 50, world(new Set(['-1,-4,-4'])), isSolid)!;
    expect([hit.x, hit.y, hit.z]).toEqual([-1, -4, -4]);
    expect([hit.nx, hit.ny, hit.nz]).toEqual([0, 1, 0]);
    expect(hit.distance).toBeCloseTo(13.2);
  });

  it('traverses diagonals without skipping voxels', () => {
    const visited: string[] = [];
    raycastVoxels(0.1, 0.2, 0.3, 1, 1, 1, 3, (x, y, z) => { visited.push(`${x},${y},${z}`); return 0; }, isSolid);
    // Consecutive voxels differ in exactly one axis by one step.
    for (let i = 1; i < visited.length; i++) {
      const a = visited[i - 1]!.split(',').map(Number), b = visited[i]!.split(',').map(Number);
      expect(a.reduce((s, v, k) => s + Math.abs(v - b[k]!), 0)).toBe(1);
    }
    expect(visited[0]).toBe('0,0,0');
  });

  it('respects the maximum distance and zero directions', () => {
    const w = world(new Set(['10,0,0']));
    expect(raycastVoxels(0.5, 0.5, 0.5, 1, 0, 0, 5, w, isSolid)).toBeNull();
    expect(raycastVoxels(0.5, 0.5, 0.5, 0, 0, 0, 5, w, isSolid)).toBeNull();
  });

  it('reports the starting voxel when the origin is inside a solid', () => {
    const hit = raycastVoxels(2.5, 2.5, 2.5, 0, 0, 1, 5, world(new Set(['2,2,2'])), isSolid)!;
    expect(hit.distance).toBe(0);
    expect([hit.nx, hit.ny, hit.nz]).toEqual([0, 0, 0]);
  });
});
