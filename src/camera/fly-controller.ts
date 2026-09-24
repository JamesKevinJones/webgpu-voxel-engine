import { Camera } from './camera';
import type { InputState } from './input';

export interface MoveIntent {
  forward: number;
  strafe: number;
  vertical: number;
  boost: boolean;
}

export function readMoveIntent(input: Pick<InputState, 'isDown'>, out: MoveIntent): MoveIntent {
  out.forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
  out.strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
  out.vertical = (input.isDown('Space') || input.isDown('KeyE') ? 1 : 0) -
    (input.isDown('KeyQ') || input.isDown('KeyC') || input.isDown('ControlLeft') ? 1 : 0);
  out.boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  return out;
}

/**
 * World-space unit direction for a movement intent. Forward/strafe move in the horizontal
 * plane (fly-cam "walk" style), vertical is world up. Diagonals are normalised.
 */
export function moveDirection(intent: MoveIntent, yaw: number, out: { [i: number]: number }): void {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let x = fx * intent.forward + rx * intent.strafe;
  let y = intent.vertical;
  let z = fz * intent.forward + rz * intent.strafe;
  const len = Math.hypot(x, y, z);
  if (len > 0) { x /= len; y /= len; z /= len; }
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

/**
 * Smooth first-person fly camera: mouse look via pointer lock, WASD + Space/Q movement,
 * Shift to boost and the wheel to change base speed. Velocity is critically damped towards
 * the target velocity, which gives smooth acceleration and gliding stops.
 */
export class FlyController {
  baseSpeed = 24;
  boostMultiplier = 4;
  /** Response rate (1/s) of the velocity smoothing. */
  responsiveness = 9;
  /** Radians per pixel of mouse movement. */
  sensitivity = 0.0022;
  readonly velocity = new Float64Array(3);
  private readonly intent: MoveIntent = { forward: 0, strafe: 0, vertical: 0, boost: false };
  private readonly direction = new Float64Array(3);
  private readonly mouse: [number, number] = [0, 0];

  constructor(private readonly camera: Camera, private readonly input: InputState) {}

  update(dt: number): void {
    const [mx, my] = this.input.consumeMouse(this.mouse);
    this.camera.yaw -= mx * this.sensitivity;
    this.camera.setPitch(this.camera.pitch - my * this.sensitivity);
    this.camera.yaw = wrapAngle(this.camera.yaw);

    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.baseSpeed = Math.min(400, Math.max(2, this.baseSpeed * Math.pow(0.85, wheel)));

    readMoveIntent(this.input, this.intent);
    moveDirection(this.intent, this.camera.yaw, this.direction);
    const speed = this.baseSpeed * (this.intent.boost ? this.boostMultiplier : 1);
    const blend = 1 - Math.exp(-this.responsiveness * dt);
    for (let i = 0; i < 3; i++) {
      const targetV = this.direction[i]! * speed;
      this.velocity[i] = this.velocity[i]! + (targetV - this.velocity[i]!) * blend;
      if (Math.abs(this.velocity[i]!) < 1e-4) this.velocity[i] = 0;
      this.camera.position[i] = this.camera.position[i]! + this.velocity[i]! * dt;
    }
  }
}

function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return a - Math.floor((a + Math.PI) / twoPi) * twoPi;
}
