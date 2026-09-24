import { invert, lookAt, mat4, multiply, perspectiveZO } from '../math/mat4';
import { Frustum } from '../math/frustum';

const WORLD_UP = new Float32Array([0, 1, 0]);
export const MAX_PITCH = (89 * Math.PI) / 180;

/**
 * Perspective camera parameterised by yaw/pitch. Yaw 0 looks down -Z; positive yaw turns left
 * (counter-clockwise seen from above); positive pitch looks up.
 */
export class Camera {
  readonly position = new Float64Array([0, 64, 0]);
  yaw = 0;
  pitch = 0;
  fovY = (70 * Math.PI) / 180;
  aspect = 16 / 9;
  near = 0.1;
  far = 1500;

  readonly view = mat4();
  readonly projection = mat4();
  readonly viewProjection = mat4();
  readonly inverseViewProjection = mat4();
  readonly frustum = new Frustum();
  readonly forward = new Float64Array([0, 0, -1]);
  readonly right = new Float64Array([1, 0, 0]);
  private readonly target = new Float64Array(3);

  /** Direction the camera looks at, from yaw/pitch. */
  static forwardFromAngles(yaw: number, pitch: number, out: { [i: number]: number }): void {
    const cp = Math.cos(pitch);
    out[0] = -Math.sin(yaw) * cp;
    out[1] = Math.sin(pitch);
    out[2] = -Math.cos(yaw) * cp;
  }

  setPitch(pitch: number): void {
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
  }

  updateMatrices(): void {
    Camera.forwardFromAngles(this.yaw, this.pitch, this.forward);
    this.right[0] = Math.cos(this.yaw);
    this.right[1] = 0;
    this.right[2] = -Math.sin(this.yaw);
    const p = this.position;
    this.target[0] = p[0]! + this.forward[0]!;
    this.target[1] = p[1]! + this.forward[1]!;
    this.target[2] = p[2]! + this.forward[2]!;
    lookAt(this.view, p, this.target, WORLD_UP);
    perspectiveZO(this.projection, this.fovY, this.aspect, this.near, this.far);
    multiply(this.viewProjection, this.projection, this.view);
    invert(this.inverseViewProjection, this.viewProjection);
    this.frustum.setFromViewProjection(this.viewProjection);
  }
}
