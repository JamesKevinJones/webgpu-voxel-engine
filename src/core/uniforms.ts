/**
 * Per-frame uniform block. Offsets are in floats and mirror `struct Frame` in
 * src/shaders/common.wgsl (every member is 16-byte aligned, so the layout is tightly packed).
 */
export const FRAME_LAYOUT = {
  viewProj: 0,
  invViewProj: 16,
  cameraPos: 32,
  sunDir: 36,
  sunColor: 40,
  skyZenith: 44,
  skyHorizon: 48,
  fog: 52,
  viewport: 56,
} as const;

export const FRAME_FLOATS = 60;
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

  setCamera(viewProj: Float32Array, invViewProj: Float32Array, position: ArrayLike<number>, time: number): void {
    this.data.set(viewProj, FRAME_LAYOUT.viewProj);
    this.data.set(invViewProj, FRAME_LAYOUT.invViewProj);
    this.setVec4(FRAME_LAYOUT.cameraPos, position[0]!, position[1]!, position[2]!, time);
  }

  setSun(direction: ArrayLike<number>, intensity: number, color: ArrayLike<number>): void {
    const len = Math.hypot(direction[0]!, direction[1]!, direction[2]!) || 1;
    this.setVec4(FRAME_LAYOUT.sunDir, direction[0]! / len, direction[1]! / len, direction[2]! / len, intensity);
    this.setVec4(FRAME_LAYOUT.sunColor, color[0]!, color[1]!, color[2]!, 0);
  }

  setSky(zenith: ArrayLike<number>, horizon: ArrayLike<number>): void {
    this.setVec4(FRAME_LAYOUT.skyZenith, zenith[0]!, zenith[1]!, zenith[2]!, 0);
    this.setVec4(FRAME_LAYOUT.skyHorizon, horizon[0]!, horizon[1]!, horizon[2]!, 0);
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
