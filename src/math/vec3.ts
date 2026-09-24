/**
 * Zero-allocation 3-component vector math. Every operation writes into a caller
 * supplied `out` array and returns it, so hot loops never touch the GC.
 */
export type Vec3 = Float32Array | Float64Array | number[];

export function vec3(x = 0, y = 0, z = 0): Float32Array {
  const out = new Float32Array(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function set<T extends Vec3>(out: T, x: number, y: number, z: number): T {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function copy<T extends Vec3>(out: T, a: Vec3): T {
  out[0] = a[0]!;
  out[1] = a[1]!;
  out[2] = a[2]!;
  return out;
}

export function add<T extends Vec3>(out: T, a: Vec3, b: Vec3): T {
  out[0] = a[0]! + b[0]!;
  out[1] = a[1]! + b[1]!;
  out[2] = a[2]! + b[2]!;
  return out;
}

export function sub<T extends Vec3>(out: T, a: Vec3, b: Vec3): T {
  out[0] = a[0]! - b[0]!;
  out[1] = a[1]! - b[1]!;
  out[2] = a[2]! - b[2]!;
  return out;
}

export function scale<T extends Vec3>(out: T, a: Vec3, s: number): T {
  out[0] = a[0]! * s;
  out[1] = a[1]! * s;
  out[2] = a[2]! * s;
  return out;
}

/** out = a + b * s */
export function scaleAndAdd<T extends Vec3>(out: T, a: Vec3, b: Vec3, s: number): T {
  out[0] = a[0]! + b[0]! * s;
  out[1] = a[1]! + b[1]! * s;
  out[2] = a[2]! + b[2]! * s;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

export function cross<T extends Vec3>(out: T, a: Vec3, b: Vec3): T {
  const ax = a[0]!, ay = a[1]!, az = a[2]!;
  const bx = b[0]!, by = b[1]!, bz = b[2]!;
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function length(a: Vec3): number {
  return Math.hypot(a[0]!, a[1]!, a[2]!);
}

export function normalize<T extends Vec3>(out: T, a: Vec3): T {
  const len = length(a);
  const inv = len > 0 ? 1 / len : 0;
  out[0] = a[0]! * inv;
  out[1] = a[1]! * inv;
  out[2] = a[2]! * inv;
  return out;
}

export function lerp<T extends Vec3>(out: T, a: Vec3, b: Vec3, t: number): T {
  out[0] = a[0]! + (b[0]! - a[0]!) * t;
  out[1] = a[1]! + (b[1]! - a[1]!) * t;
  out[2] = a[2]! + (b[2]! - a[2]!) * t;
  return out;
}
