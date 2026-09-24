import type { SkyState } from './sky';

/**
 * Per-frame uniform block. Offsets are in floats and mirror `struct Frame` in
 * src/shaders/common.wgsl (every member is 16-byte aligned, so the layout is tightly packed).
 */
export const FRAME_LAYOUT = {
  viewProj: 0,
  invViewProj: 16,
  shadowViewProj0: 32,
  shadowViewProj1: 48,
  cameraPos: 64,
  cameraDir: 68,
  lightDir: 72,
  lightColor: 76,
  sunDir: 80,
  sunColor: 84,
  skyZenith: 88,
  skyHorizon: 92,
  fog: 96,
  viewport: 100,
  clip: 104,
  shadowSplits: 108,
  shadowParams: 112,
} as const;

export const FRAME_FLOATS = 116;
export const FRAME_BYTES = FRAME_FLOATS * 4;

export interface ShadowUniforms {
  viewProj: [Float32Array, Float32Array];
  /** View depth where cascade 0 ends and where shadows end. */
  splitFar: [number, number];
  texelSize: [number, number];
  resolution: number;
  /** Fraction of each cascade used to cross-fade into the next one. */
  blend: number;
}

export class FrameUniforms {
  readonly data = new Float32Array(FRAME_FLOATS);
  private readonly bits = new Uint32Array(this.data.buffer);
  readonly buffer: GPUBuffer;

  constructor(private readonly device: GPUDevice) {
    this.buffer = device.createBuffer({
      label: 'frame uniforms',
      size: FRAME_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  setCamera(
    viewProj: Float32Array, invViewProj: Float32Array, position: ArrayLike<number>, forward: ArrayLike<number>,
    time: number, near: number, far: number,
  ): void {
    this.data.set(viewProj, FRAME_LAYOUT.viewProj);
    this.data.set(invViewProj, FRAME_LAYOUT.invViewProj);
    this.setVec4(FRAME_LAYOUT.cameraPos, position[0]!, position[1]!, position[2]!, time);
    this.data[FRAME_LAYOUT.cameraDir] = forward[0]!;
    this.data[FRAME_LAYOUT.cameraDir + 1] = forward[1]!;
    this.data[FRAME_LAYOUT.cameraDir + 2] = forward[2]!;
    this.setVec4(FRAME_LAYOUT.clip, near, far, 0, 0);
  }

  /** World seed (bit-cast into cameraDir.w) so shaders can evaluate the climate for biome tints. */
  setSeed(seed: number): void {
    this.bits[FRAME_LAYOUT.cameraDir + 3] = seed >>> 0;
  }

  setShadows(shadows: ShadowUniforms | null): void {
    if (!shadows) {
      this.setVec4(FRAME_LAYOUT.shadowParams, 0, 0, 0, 0);
      return;
    }
    this.data.set(shadows.viewProj[0], FRAME_LAYOUT.shadowViewProj0);
    this.data.set(shadows.viewProj[1], FRAME_LAYOUT.shadowViewProj1);
    this.setVec4(FRAME_LAYOUT.shadowSplits, shadows.splitFar[0], shadows.splitFar[1], shadows.texelSize[0], shadows.texelSize[1]);
    this.setVec4(FRAME_LAYOUT.shadowParams, 1, shadows.blend, 1 / shadows.resolution, 0);
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
