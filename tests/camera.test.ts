import { describe, expect, it } from 'vitest';
import { Camera, MAX_PITCH } from '../src/camera/camera';
import { FlyController, moveDirection, readMoveIntent, type MoveIntent } from '../src/camera/fly-controller';
import { InputState } from '../src/camera/input';
import { FrameTimer } from '../src/core/frame-timer';
import { transformPoint } from '../src/math/mat4';

const intent = (forward: number, strafe: number, vertical: number): MoveIntent => ({ forward, strafe, vertical, boost: false });

describe('Camera', () => {
  it('looks down -Z at yaw 0 and turns left with positive yaw', () => {
    const f = [0, 0, 0];
    Camera.forwardFromAngles(0, 0, f);
    expect(f.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 0, -1]);
    Camera.forwardFromAngles(Math.PI / 2, 0, f);
    expect(f[0]).toBeCloseTo(-1);
    expect(f[2]).toBeCloseTo(0);
    Camera.forwardFromAngles(0, Math.PI / 4, f);
    expect(f[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('projects points ahead to the screen centre and clamps pitch', () => {
    const cam = new Camera();
    cam.position.set([10, 20, 30]);
    cam.yaw = 0.7;
    cam.setPitch(0.3);
    cam.updateMatrices();
    const ahead = [10 + cam.forward[0]! * 50, 20 + cam.forward[1]! * 50, 30 + cam.forward[2]! * 50];
    const ndc = transformPoint([0, 0, 0], cam.viewProjection, ahead[0]!, ahead[1]!, ahead[2]!);
    expect(ndc[0]).toBeCloseTo(0, 4);
    expect(ndc[1]).toBeCloseTo(0, 4);
    expect(ndc[2]).toBeGreaterThan(0);
    expect(ndc[2]).toBeLessThan(1);
    expect(cam.frustum.intersectsAabb(ahead[0]! - 1, ahead[1]! - 1, ahead[2]! - 1, ahead[0]! + 1, ahead[1]! + 1, ahead[2]! + 1)).toBe(true);
    const behind = [10 - cam.forward[0]! * 50, 20 - cam.forward[1]! * 50, 30 - cam.forward[2]! * 50];
    expect(cam.frustum.intersectsAabb(behind[0]! - 1, behind[1]! - 1, behind[2]! - 1, behind[0]! + 1, behind[1]! + 1, behind[2]! + 1)).toBe(false);
    cam.setPitch(10);
    expect(cam.pitch).toBe(MAX_PITCH);
  });
});

describe('fly controller', () => {
  it('maps WASD/Space/Q to a normalised world direction', () => {
    const d = [0, 0, 0];
    moveDirection(intent(1, 0, 0), 0, d);
    expect(d.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 0, -1]);
    moveDirection(intent(0, 1, 0), 0, d);
    expect(d[0]).toBeCloseTo(1);
    moveDirection(intent(1, 1, 1), 0.3, d);
    expect(Math.hypot(d[0]!, d[1]!, d[2]!)).toBeCloseTo(1);
    moveDirection(intent(0, 0, 0), 0, d);
    expect(d.map((v) => v + 0)).toEqual([0, 0, 0]);
  });

  it('reads keyboard state into movement intents', () => {
    const input = new InputState();
    input.keys.add('KeyW');
    input.keys.add('KeyA');
    input.keys.add('Space');
    input.keys.add('ShiftLeft');
    expect(readMoveIntent(input, intent(0, 0, 0))).toEqual({ forward: 1, strafe: -1, vertical: 1, boost: true });
  });

  it('accelerates smoothly towards the target speed and applies mouse look', () => {
    const cam = new Camera();
    cam.position.set([0, 0, 0]);
    const input = new InputState();
    const fly = new FlyController(cam, input);
    input.keys.add('KeyW');
    fly.update(1 / 60);
    const firstSpeed = Math.hypot(...fly.velocity);
    expect(firstSpeed).toBeGreaterThan(0);
    expect(firstSpeed).toBeLessThan(fly.baseSpeed);
    for (let i = 0; i < 120; i++) fly.update(1 / 60);
    expect(Math.hypot(...fly.velocity)).toBeCloseTo(fly.baseSpeed, 1);
    expect(cam.position[2]).toBeLessThan(0);
    input.keys.clear();
    for (let i = 0; i < 120; i++) fly.update(1 / 60);
    expect(Math.hypot(...fly.velocity)).toBeLessThan(0.01);

    input.injectMouse(100, -50);
    fly.update(1 / 60);
    expect(cam.yaw).toBeCloseTo(-100 * fly.sensitivity);
    expect(cam.pitch).toBeCloseTo(50 * fly.sensitivity);
  });
});

describe('FrameTimer', () => {
  it('reports FPS over its window and clamps large deltas', () => {
    const t = new FrameTimer(1000, 0.1);
    expect(t.tick(0)).toBe(0);
    let now = 0;
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      expect(t.tick(now)).toBeCloseTo(1 / 60);
    }
    expect(t.fps).toBeCloseTo(60, 0);
    expect(t.frameMs).toBeCloseTo(1000 / 60, 1);
    expect(t.tick(now + 5000)).toBe(0.1);
  });
});
