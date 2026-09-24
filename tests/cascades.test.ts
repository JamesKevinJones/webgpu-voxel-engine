import { describe, expect, it } from 'vitest';
import { Camera } from '../src/camera/camera';
import { cascadeSplits, computeCascades, frustumSliceCorners, lightBasis, type CascadeCamera } from '../src/core/cascades';
import { transformPoint } from '../src/math/mat4';

function camera(x = 10, y = 40, z = -20, yaw = 0.7, pitch = -0.3): CascadeCamera {
  const cam = new Camera();
  cam.position.set([x, y, z]);
  cam.yaw = yaw;
  cam.setPitch(pitch);
  cam.aspect = 16 / 9;
  cam.updateMatrices();
  // up = right × forward
  const f = cam.forward, r = cam.right;
  const up = [r[1]! * f[2]! - r[2]! * f[1]!, r[2]! * f[0]! - r[0]! * f[2]!, r[0]! * f[1]! - r[1]! * f[0]!];
  return { position: cam.position, forward: f, right: r, up, fovY: cam.fovY, aspect: cam.aspect };
}

const LIGHT = [0.4, 0.8, 0.35];

describe('cascade splits', () => {
  it('spans [near, far] monotonically', () => {
    const s = cascadeSplits(0.1, 160, 2, 0.7);
    expect(s).toHaveLength(3);
    expect(s[0]).toBe(0.1);
    expect(s[2]).toBe(160);
    expect(s[1]).toBeGreaterThan(s[0]!);
    expect(s[1]).toBeLessThan(s[2]!);
  });

  it('interpolates between uniform (λ = 0) and logarithmic (λ = 1) splitting', () => {
    expect(cascadeSplits(1, 100, 2, 0)[1]).toBeCloseTo(50.5);
    expect(cascadeSplits(1, 100, 2, 1)[1]).toBeCloseTo(10);
    const mid = cascadeSplits(1, 100, 2, 0.5)[1]!;
    expect(mid).toBeCloseTo((50.5 + 10) / 2);
    const four = cascadeSplits(0.5, 200, 4, 0.8);
    for (let i = 1; i < four.length; i++) expect(four[i]).toBeGreaterThan(four[i - 1]!);
  });
});

describe('cascade fitting', () => {
  it('builds an orthonormal light basis facing the light', () => {
    for (const dir of [LIGHT, [0, 1, 0], [0.01, -1, 0], [1, 0, 0]]) {
      const { x, y, z } = lightBasis(dir);
      const d = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
      expect(d(x, y)).toBeCloseTo(0, 10);
      expect(d(x, z)).toBeCloseTo(0, 10);
      expect(d(y, z)).toBeCloseTo(0, 10);
      for (const v of [x, y, z]) expect(Math.hypot(...v)).toBeCloseTo(1, 10);
    }
  });

  it('contains every corner of its frustum slice inside the light clip volume', () => {
    const cam = camera();
    const cascades = computeCascades(cam, LIGHT, 0.1, 160, 2, 0.7, 2048, 96);
    expect(cascades).toHaveLength(2);
    const out = [0, 0, 0];
    for (const c of cascades) {
      for (const p of frustumSliceCorners(cam, c.near, c.far)) {
        transformPoint(out, c.viewProj, p[0], p[1], p[2]);
        expect(Math.abs(out[0]!)).toBeLessThanOrEqual(1 + 1e-4);
        expect(Math.abs(out[1]!)).toBeLessThanOrEqual(1 + 1e-4);
        expect(out[2]).toBeGreaterThanOrEqual(-1e-6);
        expect(out[2]).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
    // The near cascade has finer texels than the far one.
    expect(cascades[0]!.texelSize).toBeLessThan(cascades[1]!.texelSize);
    expect(cascades[0]!.far).toBe(cascades[1]!.near);
  });

  it('includes occluders between the slice and the light (caster margin)', () => {
    const cam = camera();
    const [c] = computeCascades(cam, LIGHT, 0.1, 160, 2, 0.7, 2048, 96);
    const out = [0, 0, 0];
    // A point 60 m towards the light from the slice centre projects in front of the slice.
    const p = c!.center.map((v, i) => v + LIGHT[i]! / Math.hypot(...LIGHT) * 60);
    transformPoint(out, c!.viewProj, p[0]!, p[1]!, p[2]!);
    expect(out[2]).toBeGreaterThanOrEqual(0);
    transformPoint(out, c!.viewProj, c!.center[0], c!.center[1], c!.center[2]);
    expect(out[2]).toBeGreaterThan(0.3); // depth range is not wasted
  });

  it('keeps world positions on the same sub-texel offset while the camera moves (no shimmering)', () => {
    const res = 2048;
    const frac = (cam: CascadeCamera) => {
      const [c] = computeCascades(cam, LIGHT, 0.1, 160, 2, 0.7, res, 96);
      const out = [0, 0, 0];
      transformPoint(out, c!.viewProj, 3.3, 7.7, 1.1);
      const tx = (out[0]! * 0.5 + 0.5) * res, ty = (out[1]! * 0.5 + 0.5) * res;
      return [tx - Math.floor(tx), ty - Math.floor(ty), c!.radius];
    };
    const a = frac(camera(10, 40, -20));
    for (const [dx, dz] of [[0.37, 0], [0, 1.9], [4.2, -3.3]]) {
      const b = frac(camera(10 + dx!, 40, -20 + dz!));
      if (b[2] !== a[2]) continue; // radius quantisation step (rare): texel size changed
      expect(b[0]).toBeCloseTo(a[0]!, 3);
      expect(b[1]).toBeCloseTo(a[1]!, 3);
    }
  });

  it('keeps the box size fixed as the camera rotates', () => {
    const r = (yaw: number, pitch: number) => computeCascades(camera(0, 30, 0, yaw, pitch), LIGHT, 0.1, 160, 2, 0.7, 2048, 96)[1]!.radius;
    const base = r(0, 0);
    for (const [yaw, pitch] of [[1, 0.2], [2.5, -0.8], [-1.2, 1.1]]) expect(r(yaw!, pitch!)).toBe(base);
  });
});
