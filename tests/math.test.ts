import { describe, expect, it } from 'vitest';
import { Frustum } from '../src/math/frustum';
import { identity, invert, lookAt, mat4, multiply, perspectiveZO, transformPoint } from '../src/math/mat4';
import * as v3 from '../src/math/vec3';
import { mulberry32 } from './helpers';

function randomMatrix(rand: () => number): Float32Array {
  const m = new Float32Array(16);
  for (let i = 0; i < 16; i++) m[i] = rand() * 4 - 2;
  return m;
}

function expectClose(a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-4): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(eps);
}

describe('vec3', () => {
  it('performs basic operations without allocating', () => {
    const out = v3.vec3();
    expect(v3.add(out, [1, 2, 3], [4, 5, 6])).toBe(out);
    expect([...out]).toEqual([5, 7, 9]);
    expect([...v3.sub(out, [1, 2, 3], [4, 5, 6])]).toEqual([-3, -3, -3]);
    expect([...v3.scale(out, [1, 2, 3], 2)]).toEqual([2, 4, 6]);
    expect([...v3.scaleAndAdd(out, [1, 1, 1], [1, 2, 3], 0.5)]).toEqual([1.5, 2, 2.5]);
    expect(v3.dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect([...v3.cross(out, [1, 0, 0], [0, 1, 0])]).toEqual([0, 0, 1]);
    expect(v3.length([3, 4, 12])).toBe(13);
    expectClose(v3.normalize(out, [0, 3, 4]), [0, 0.6, 0.8]);
    expect([...v3.normalize(out, [0, 0, 0])]).toEqual([0, 0, 0]);
    expectClose(v3.lerp(out, [0, 0, 0], [2, 4, 6], 0.25), [0.5, 1, 1.5]);
  });

  it('supports aliasing of output and inputs', () => {
    const a = v3.vec3(1, 2, 3);
    v3.cross(a, a, [0, 0, 1]);
    expect([...a]).toEqual([2, -1, 0]);
  });
});

describe('mat4', () => {
  it('multiplies by identity and composes associatively', () => {
    const rand = mulberry32(1);
    const a = randomMatrix(rand), b = randomMatrix(rand), c = randomMatrix(rand);
    const out = mat4();
    expectClose(multiply(out, a, identity(mat4())), a);
    expectClose(multiply(mat4(), identity(mat4()), a), a);
    const ab_c = multiply(mat4(), multiply(mat4(), a, b), c);
    const a_bc = multiply(mat4(), a, multiply(mat4(), b, c));
    expectClose(ab_c, a_bc, 1e-3);
  });

  it('multiply is safe when the output aliases an input', () => {
    const rand = mulberry32(2);
    const a = randomMatrix(rand), b = randomMatrix(rand);
    const expected = multiply(mat4(), a, b);
    const aliased = Float32Array.from(a);
    multiply(aliased, aliased, b);
    expectClose(aliased, expected);
  });

  it('inverts matrices (M * M⁻¹ = I) and rejects singular ones', () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 20; i++) {
      const m = randomMatrix(rand);
      const inv = invert(mat4(), m)!;
      expect(inv).not.toBeNull();
      expectClose(multiply(mat4(), m, inv), identity(mat4()), 1e-3);
    }
    expect(invert(mat4(), new Float32Array(16))).toBeNull();
  });

  it('maps the near and far planes to WebGPU depth 0 and 1', () => {
    const p = perspectiveZO(mat4(), Math.PI / 2, 16 / 9, 0.5, 200);
    const out = [0, 0, 0];
    transformPoint(out, p, 0, 0, -0.5);
    expect(out[2]).toBeCloseTo(0, 5);
    transformPoint(out, p, 0, 0, -200);
    expect(out[2]).toBeCloseTo(1, 5);
    transformPoint(out, p, 0, 0, -10);
    expect(out[2]).toBeGreaterThan(0);
    expect(out[2]).toBeLessThan(1);
    // 90° vertical FOV: a point at 45° up lands on the top edge.
    transformPoint(out, p, 0, 10, -10);
    expect(out[1]).toBeCloseTo(1, 5);
    transformPoint(out, p, (10 * 16) / 9, 0, -10);
    expect(out[0]).toBeCloseTo(1, 4);
  });

  it('builds right-handed view matrices', () => {
    const eye = [10, 5, -3];
    const view = lookAt(mat4(), eye, [10, 5, -13], [0, 1, 0]);
    const out = [0, 0, 0];
    expectClose(transformPoint(out, view, eye[0]!, eye[1]!, eye[2]!), [0, 0, 0]);
    expectClose(transformPoint(out, view, 10, 5, -13), [0, 0, -10]);
    expectClose(transformPoint(out, view, 11, 5, -3), [1, 0, 0]);
    expectClose(transformPoint(out, view, 10, 6, -3), [0, 1, 0]);
  });
});

describe('Frustum', () => {
  const view = lookAt(mat4(), [0, 0, 0], [0, 0, -1], [0, 1, 0]);
  const proj = perspectiveZO(mat4(), Math.PI / 3, 1, 0.1, 100);
  const vp = multiply(mat4(), proj, view);
  const frustum = new Frustum().setFromViewProjection(vp);

  it('keeps boxes inside or straddling the frustum', () => {
    expect(frustum.intersectsAabb(-1, -1, -11, 1, 1, -9)).toBe(true);
    expect(frustum.intersectsAabb(-50, -50, -60, 50, 50, 5)).toBe(true); // contains the camera
    expect(frustum.intersectsAabb(-1, -1, -101, 1, 1, -99)).toBe(true); // straddles far plane
  });

  it('culls boxes behind, beyond or beside the camera', () => {
    expect(frustum.intersectsAabb(-1, -1, 5, 1, 1, 10)).toBe(false);
    expect(frustum.intersectsAabb(-1, -1, -300, 1, 1, -200)).toBe(false);
    expect(frustum.intersectsAabb(50, -1, -11, 52, 1, -9)).toBe(false);
    expect(frustum.intersectsAabb(-1, 30, -11, 1, 32, -9)).toBe(false);
  });

  it('produces unit-length plane normals', () => {
    for (let i = 0; i < 6; i++) {
      const p = frustum.planes;
      expect(Math.hypot(p[i * 4]!, p[i * 4 + 1]!, p[i * 4 + 2]!)).toBeCloseTo(1, 5);
    }
  });
});
