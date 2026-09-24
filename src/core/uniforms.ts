import type { SkyState } from './sky';

/**
 * Per-frame uniform block. Offsets are in floats and mirror `struct Frame` in
 * src/shaders/common.wgsl (every member is 16-byte aligned, so the layout is tightly packed).
 */
export const FRAME_LAYOUT = {
  viewProj: 0,
  invViewProj: 16,
  cameraPos: 32,
  lightDir: 36,
  lightColor: 40,
  sunDir: 44,
  sunColor: 48,
  skyZenith: 52,
  skyHorizon: 56,
  fog: 60,
  viewport: 64,
  clip: 68,
} as const;

export const FRAME_FLOATS = 72;
export const FRAME_BYTES = FRAME_FLOATS * 4;

export class FrameUniforms {
  readonly data = new Float32Array(FRAME_FLOATS);
  readonly buffer: GPUBuffer;

  constructor(private readonly device: GPUDevice) {
    this.buffer = device.createBuffer({
      label: 'frame uniforms',
      size: FRAME_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  setCamera(viewProj: Float32Array, invViewProj: Float32Array, position: ArrayLike<number>, time: number, near: number, far: number): void {
    this.data.set(viewProj, FRAME_LAYOUT.viewProj);
    this.data.set(invViewProj, FRAME_LAYOUT.invViewProj);
    this.setVec4(FRAME_LAYOUT.cameraPos, position[0]!, position[1]!, position[2]!, time);
    this.setVec4(FRAME_LAYOUT.clip, near, far, 0, 0);
  }

  /** Sun/moon lighting and sky gradient for the current time of day. */
  setSky(sky: SkyState): void {
    const { lightDir: l, lightColor: lc, sunDir: s, sunColor: sc, zenith: z, horizon: h } = sky;
    this.setVec4(FRAME_LAYOUT.lightDir, l[0], l[1], l[2], sky.lightIntensity);
    this.setVec4(FRAME_LAYOUT.lightColor, lc[0], lc[1], lc[2], sky.daylight);
    this.setVec4(FRAME_LAYOUT.sunDir, s[0], s[1], s[2], sky.sunVisibility);
    this.setVec4(FRAME_LAYOUT.sunColor, sc[0], sc[1], sc[2], sky.moonVisibility);
    this.setVec4(FRAME_LAYOUT.skyZenith, z[0], z[1], z[2], sky.starVisibility);
    this.setVec4(FRAME_LAYOUT.skyHorizon, h[0], h[1], h[2], 0);
  }

  setFog(endDistance: number, density: number, heightFalloff: number, baseHeight: number): void {
    this.setVec4(FRAME_LAYOUT.fog, endDistance, density, heightFalloff, baseHeight);
  }

  setViewport(width: number, height: number): void {
    this.setVec4(FRAME_LAYOUT.viewport, width, height, 1 / width, 1 / height);
  }

  upload(): void {
    this.device.queue.writeBuffer(this.buffer, 0, this.data);
  }

  private setVec4(offset: number, x: number, y: number, z: number, w: number): void {
    this.data[offset] = x;
    this.data[offset + 1] = y;
    this.data[offset + 2] = z;
    this.data[offset + 3] = w;
  }
}
