import { aabb, intersectsSolid, moveBox, sweepAxis, translate, type Aabb, type SolidQuery } from './aabb';

export interface PlayerConfig {
  width: number;
  height: number;
  eyeHeight: number;
  /** Downward acceleration (m/s²): Earth gravity scaled up for snappier, game-like jumps. */
  gravity: number;
  /** Apex height of a jump in metres (the launch speed is derived from it). */
  jumpHeight: number;
  walkSpeed: number;
  sprintSpeed: number;
  /** Velocity response rates (1/s): higher = snappier acceleration and stronger friction. */
  groundResponse: number;
  airResponse: number;
  waterResponse: number;
  /** Highest ledge climbed automatically while walking. */
  stepHeight: number;
  maxFallSpeed: number;
  swimSpeed: number;
  /** Fixed simulation step (s). */
  timestep: number;
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  width: 0.6,
  height: 1.8,
  eyeHeight: 1.6,
  gravity: 9.8 * 2.8,
  jumpHeight: 1.25,
  walkSpeed: 4.3,
  sprintSpeed: 7.0,
  groundResponse: 14,
  airResponse: 2.5,
  waterResponse: 5,
  stepHeight: 1.0,
  maxFallSpeed: 60,
  swimSpeed: 3.2,
  timestep: 1 / 120,
};

export interface PlayerInput {
  /** -1..1 along the view direction (horizontal). */
  forward: number;
  /** -1..1 to the right. */
  strafe: number;
  jump: boolean;
  sprint: boolean;
}

export interface PlayerWorld {
  solid: SolidQuery;
  water: (x: number, y: number, z: number) => boolean;
}

/**
 * First-person walking player: an AABB with gravity, jumping, sprinting, ground friction, swimming
 * and automatic step-up onto single-block ledges, integrated at a fixed timestep.
 * `position` is the centre of the box's bottom face (the feet).
 */
export class Player {
  readonly config: PlayerConfig;
  readonly position = new Float64Array(3);
  readonly velocity = new Float64Array(3);
  grounded = false;
  inWater = false;
  /** Visual-only offset that smooths the camera after a step-up (decays to 0). */
  stepOffset = 0;
  private accumulator = 0;
  private readonly box: Aabb = aabb(0, 0, 0, 0, 0, 0);

  constructor(config: Partial<PlayerConfig> = {}) {
    this.config = { ...DEFAULT_PLAYER_CONFIG, ...config };
  }

  get jumpSpeed(): number {
    return Math.sqrt(2 * this.config.gravity * this.config.jumpHeight);
  }

  /** Eye position (y includes the step smoothing offset). */
  eye(out: { [i: number]: number }): void {
    out[0] = this.position[0]!;
    out[1] = this.position[1]! + this.config.eyeHeight + this.stepOffset;
    out[2] = this.position[2]!;
  }

  setFromEye(x: number, y: number, z: number): void {
    this.position[0] = x;
    this.position[1] = y - this.config.eyeHeight;
    this.position[2] = z;
    this.velocity.fill(0);
    this.stepOffset = 0;
    this.accumulator = 0;
    this.grounded = false;
  }

  bounds(out: Aabb = this.box): Aabb {
    const h = this.config.width / 2;
    const p = this.position;
    out.minX = p[0]! - h; out.maxX = p[0]! + h;
    out.minY = p[1]!; out.maxY = p[1]! + this.config.height;
    out.minZ = p[2]! - h; out.maxZ = p[2]! + h;
    return out;
  }

  /** Lifts the player out of solid terrain (e.g. after switching from free-fly). Returns false if stuck. */
  resolveEmbedded(solid: SolidQuery, maxLift = 64): boolean {
    for (let i = 0; i <= maxLift; i++) {
      if (!intersectsSolid(this.bounds(), solid)) return true;
      this.position[1] = Math.floor(this.position[1]!) + 1;
    }
    return false;
  }

  /** Advances the simulation by `dt` seconds using fixed sub-steps. */
  update(dt: number, input: PlayerInput, yaw: number, world: PlayerWorld): void {
    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    const h = this.config.timestep;
    while (this.accumulator >= h) {
      this.tick(h, input, yaw, world);
      this.accumulator -= h;
    }
  }

  tick(h: number, input: PlayerInput, yaw: number, world: PlayerWorld): void {
    const c = this.config;
    const p = this.position, v = this.velocity;
    this.inWater = world.water(Math.floor(p[0]!), Math.floor(p[1]! + c.height * 0.4), Math.floor(p[2]!));

    // Horizontal: blend towards the target velocity (acceleration + friction in one term).
    let fx = -Math.sin(yaw) * input.forward + Math.cos(yaw) * input.strafe;
    let fz = -Math.cos(yaw) * input.forward - Math.sin(yaw) * input.strafe;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    let speed = input.sprint ? c.sprintSpeed : c.walkSpeed;
    if (this.inWater) speed *= 0.55;
    const rate = this.inWater ? c.waterResponse : this.grounded ? c.groundResponse : c.airResponse;
    const blend = 1 - Math.exp(-rate * h);
    v[0] = v[0]! + (fx * speed - v[0]!) * blend;
    v[2] = v[2]! + (fz * speed - v[2]!) * blend;

    // Vertical: gravity, jumping, buoyant swimming.
    if (this.inWater) {
      v[1] = v[1]! - c.gravity * 0.2 * h;
      v[1] = v[1]! * Math.exp(-3 * h);
      if (input.jump) v[1] = Math.min(v[1]! + c.gravity * 0.6 * h, c.swimSpeed);
    } else {
      v[1] = v[1]! - c.gravity * h;
      if (input.jump && this.grounded) {
        v[1] = this.jumpSpeed;
        this.grounded = false;
      }
    }
    v[1] = Math.max(v[1]!, -c.maxFallSpeed);

    const wasGrounded = this.grounded;
    const box = this.bounds();
    const start: Aabb = { ...box };
    const dx = v[0]! * h, dy = v[1]! * h, dz = v[2]! * h;
    let result = moveBox(box, dx, dy, dz, world.solid);
    let steppedUp = false;

    // Step-up: when walking into a ledge, retry the horizontal move from up to stepHeight higher.
    if (wasGrounded && (result.hitX || result.hitZ) && c.stepHeight > 0) {
      const raised: Aabb = { ...start };
      const up = sweepAxis(raised, 1, c.stepHeight, world.solid);
      translate(raised, 1, up);
      const stepped = moveBox(raised, dx, 0, dz, world.solid);
      const down = sweepAxis(raised, 1, -up, world.solid);
      translate(raised, 1, down);
      const gained = Math.hypot(stepped.dx, stepped.dz) - Math.hypot(result.dx, result.dz);
      if (gained > 1e-6 && raised.minY > start.minY) {
        this.stepOffset -= raised.minY - start.minY;
        Object.assign(box, raised);
        result = stepped;
        steppedUp = true;
      }
    }

    p[0] = (box.minX + box.maxX) / 2;
    p[1] = box.minY;
    p[2] = (box.minZ + box.maxZ) / 2;
    if (result.hitX) v[0] = 0;
    if (result.hitZ) v[2] = 0;
    if (result.hitY) v[1] = 0; // landed or bumped a ceiling
    this.grounded = steppedUp || (result.hitY && dy < 0);
    this.stepOffset *= Math.exp(-14 * h);
    if (Math.abs(this.stepOffset) < 1e-3) this.stepOffset = 0;
  }
}
