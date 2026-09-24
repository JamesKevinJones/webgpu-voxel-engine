import { mat4, multiply, type Mat4 } from '../math/mat4';

/**
 * Cascaded shadow map math for a directional light.
 *
 * Splits use the "practical" scheme (a blend of logarithmic and uniform splitting). Each cascade
 * encloses its slice of the camera frustum in a bounding sphere, so the orthographic light box
 * keeps a constant size while the camera rotates, and the box centre is snapped to whole shadow
 * texels in light space so it does not shimmer while the camera moves.
 */
export interface CascadeCamera {
  position: ArrayLike<number>;
  forward: ArrayLike<number>;
  right: ArrayLike<number>;
  up: ArrayLike<number>;
  fovY: number;
  aspect: number;
}

export interface Cascade {
  /** World → light clip space (x, y in [-1, 1], z in [0, 1]). */
  viewProj: Mat4;
  /** View-depth range [near, far] covered by the cascade. */
  near: number;
  far: number;
  center: [number, number, number];
  radius: number;
  /** World-space size of one shadow-map texel. */
  texelSize: number;
}

/**
 * Split distances [near, s1, …, far] (count + 1 values). lambda = 1 is logarithmic, 0 uniform.
 */
export function cascadeSplits(near: number, far: number, count: number, lambda: number): number[] {
  const splits = [near];
  for (let i = 1; i < count; i++) {
    const f = i / count;
    const log = near * Math.pow(far / near, f);
    const uniform = near + (far - near) * f;
    splits.push(lambda * log + (1 - lambda) * uniform);
  }
  splits.push(far);
  return splits;
}

/** The eight world-space corners of the camera frustum slice between view depths d0 and d1. */
export function frustumSliceCorners(cam: CascadeCamera, d0: number, d1: number): [number, number, number][] {
  const ty = Math.tan(cam.fovY / 2), tx = ty * cam.aspect;
  const corners: [number, number, number][] = [];
  for (const d of [d0, d1]) {
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 1]) {
        const p: [number, number, number] = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          p[k] = cam.position[k]! + cam.forward[k]! * d + cam.right[k]! * sx * d * tx + cam.up[k]! * sy * d * ty;
        }
        corners.push(p);
      }
    }
  }
  return corners;
}

/** Orthonormal light basis (rows of the light view rotation); the light looks along -lightDir. */
export function lightBasis(lightDir: ArrayLike<number>): { x: number[]; y: number[]; z: number[] } {
  const len = Math.hypot(lightDir[0]!, lightDir[1]!, lightDir[2]!);
  const z = [lightDir[0]! / len, lightDir[1]! / len, lightDir[2]! / len];
  const ref = Math.abs(z[1]!) > 0.99 ? [0, 0, 1] : [0, 1, 0];
  let x = [ref[1]! * z[2]! - ref[2]! * z[1]!, ref[2]! * z[0]! - ref[0]! * z[2]!, ref[0]! * z[1]! - ref[1]! * z[0]!];
  const xl = Math.hypot(x[0]!, x[1]!, x[2]!);
  x = x.map((v) => v / xl);
  const y = [z[1]! * x[2]! - z[2]! * x[1]!, z[2]! * x[0]! - z[0]! * x[2]!, z[0]! * x[1]! - z[1]! * x[0]!];
  return { x, y, z };
}

/**
 * Fits an orthographic light projection around a frustum slice.
 * `casterMargin` extends the box towards the light so off-screen occluders still cast shadows.
 */
export function fitCascade(
  corners: readonly (readonly number[])[],
  lightDir: ArrayLike<number>,
  resolution: number,
  casterMargin: number,
  near: number,
  far: number,
): Cascade {
  const center: [number, number, number] = [0, 0, 0];
  for (const c of corners) for (let k = 0; k < 3; k++) center[k] += c[k]! / corners.length;
  let radius = 0;
  for (const c of corners) radius = Math.max(radius, Math.hypot(c[0]! - center[0], c[1]! - center[1], c[2]! - center[2]));
  // Quantise the radius so the box size (and texel size) only changes in coarse steps.
  radius = Math.ceil(radius * 4) / 4;
  const texelSize = (2 * radius) / resolution;

  const { x, y, z } = lightBasis(lightDir);
  const dot = (a: number[], b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  // Centre in light space, snapped to the texel grid (the basis is fixed for a given light direction).
  const cx = Math.floor(dot(x, center) / texelSize) * texelSize;
  const cy = Math.floor(dot(y, center) / texelSize) * texelSize;
  const cz = dot(z, center);

  // Light view (rotation only; translation folded into the projection bounds).
  const view = mat4();
  view[0] = x[0]!; view[4] = x[1]!; view[8] = x[2]!;
  view[1] = y[0]!; view[5] = y[1]!; view[9] = y[2]!;
  view[2] = z[0]!; view[6] = z[1]!; view[10] = z[2]!;
  view[12] = 0; view[13] = 0; view[14] = 0; view[15] = 1;

  // Orthographic projection: x,y → [-1,1] around the snapped centre; light-space z (towards the
  // light) from cz + radius + margin (depth 0) down to cz - radius (depth 1).
  const zNear = cz + radius + casterMargin;
  const zFar = cz - radius;
  const proj = mat4();
  proj.fill(0);
  proj[0] = 1 / radius;
  proj[5] = 1 / radius;
  proj[10] = -1 / (zNear - zFar);
  proj[12] = -cx / radius;
  proj[13] = -cy / radius;
  proj[14] = zNear / (zNear - zFar);
  proj[15] = 1;
  return { viewProj: multiply(mat4(), proj, view), near, far, center, radius, texelSize };
}

/** Builds all cascades for the camera. */
export function computeCascades(
  cam: CascadeCamera,
  lightDir: ArrayLike<number>,
  near: number,
  shadowDistance: number,
  count: number,
  lambda: number,
  resolution: number,
  casterMargin: number,
): Cascade[] {
  const splits = cascadeSplits(near, shadowDistance, count, lambda);
  const cascades: Cascade[] = [];
  for (let i = 0; i < count; i++) {
    const corners = frustumSliceCorners(cam, splits[i]!, splits[i + 1]!);
    cascades.push(fitCascade(corners, lightDir, resolution, casterMargin, splits[i]!, splits[i + 1]!));
  }
  return cascades;
}
