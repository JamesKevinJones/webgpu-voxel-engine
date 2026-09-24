import type { Mat4 } from './mat4';

/**
 * Six clip planes (a,b,c,d) packed into a Float32Array(24), normals pointing inwards.
 * Extracted from a WebGPU (z in [0,1]) view-projection matrix (Gribb/Hartmann).
 */
export class Frustum {
  readonly planes = new Float32Array(24);

  setFromViewProjection(m: Mat4): this {
    // Row i of a column-major matrix is (m[i], m[4+i], m[8+i], m[12+i]).
    const r0x = m[0]!, r0y = m[4]!, r0z = m[8]!, r0w = m[12]!;
    const r1x = m[1]!, r1y = m[5]!, r1z = m[9]!, r1w = m[13]!;
    const r2x = m[2]!, r2y = m[6]!, r2z = m[10]!, r2w = m[14]!;
    const r3x = m[3]!, r3y = m[7]!, r3z = m[11]!, r3w = m[15]!;
    this.writePlane(0, r3x + r0x, r3y + r0y, r3z + r0z, r3w + r0w); // left
    this.writePlane(1, r3x - r0x, r3y - r0y, r3z - r0z, r3w - r0w); // right
    this.writePlane(2, r3x + r1x, r3y + r1y, r3z + r1z, r3w + r1w); // bottom
    this.writePlane(3, r3x - r1x, r3y - r1y, r3z - r1z, r3w - r1w); // top
    this.writePlane(4, r2x, r2y, r2z, r2w); // near (z >= 0)
    this.writePlane(5, r3x - r2x, r3y - r2y, r3z - r2z, r3w - r2w); // far (z <= w)
    return this;
  }

  private writePlane(i: number, a: number, b: number, c: number, d: number): void {
    const len = Math.hypot(a, b, c) || 1;
    const o = i * 4;
    this.planes[o] = a / len;
    this.planes[o + 1] = b / len;
    this.planes[o + 2] = c / len;
    this.planes[o + 3] = d / len;
  }

  /** Conservative AABB test: false only when the box is fully outside one plane. */
  intersectsAabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const p = this.planes;
    for (let i = 0; i < 24; i += 4) {
      const a = p[i]!, b = p[i + 1]!, c = p[i + 2]!, d = p[i + 3]!;
      // Positive vertex: the box corner furthest along the plane normal.
      const x = a >= 0 ? maxX : minX;
      const y = b >= 0 ? maxY : minY;
      const z = c >= 0 ? maxZ : minZ;
      if (a * x + b * y + c * z + d < 0) return false;
    }
    return true;
  }
}
