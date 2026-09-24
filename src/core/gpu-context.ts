export class WebGpuUnavailableError extends Error {
  override name = 'WebGpuUnavailableError';
}

export interface GpuContextOptions {
  /**
   * Render into an offscreen texture instead of the canvas swap chain. Used for headless
   * automation (environments without a presentable surface) and frame capture.
   */
  offscreen?: boolean;
}

export interface CapturedFrame {
  width: number;
  height: number;
  /** Tightly packed RGBA8 pixels, top row first. */
  pixels: Uint8Array;
}

/**
 * Owns the adapter/device/canvas configuration and the depth buffer, and keeps the swap chain
 * (or the offscreen colour target) sized to the canvas' CSS size × devicePixelRatio.
 */
export class GpuContext {
  static readonly DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
  static readonly OFFSCREEN_FORMAT: GPUTextureFormat = 'rgba8unorm';

  depthTexture: GPUTexture | null = null;
  depthView: GPUTextureView | null = null;
  width = 0;
  height = 0;
  private offscreenTexture: GPUTexture | null = null;
  private offscreenView: GPUTextureView | null = null;

  private constructor(
    readonly adapter: GPUAdapter,
    readonly device: GPUDevice,
    readonly canvas: HTMLCanvasElement,
    readonly context: GPUCanvasContext | null,
    readonly format: GPUTextureFormat,
  ) {}

  get offscreen(): boolean {
    return this.context === null;
  }

  static async create(canvas: HTMLCanvasElement, options: GpuContextOptions = {}): Promise<GpuContext> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new WebGpuUnavailableError('WebGPU is not supported by this browser.');
    }
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new WebGpuUnavailableError('No suitable WebGPU adapter was found.');
    // The vertex and voxel pools are large single storage buffers: ask for everything the adapter offers.
    const device = await adapter.requestDevice({
      label: 'voxel-engine device',
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    let context: GPUCanvasContext | null = null;
    let format = GpuContext.OFFSCREEN_FORMAT;
    if (!options.offscreen) {
      context = canvas.getContext('webgpu');
      if (!context) throw new WebGpuUnavailableError('Could not create a WebGPU canvas context.');
      format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'opaque' });
    }
    const gpu = new GpuContext(adapter, device, canvas, context, format);
    gpu.resize();
    return gpu;
  }

  /** Matches the backing store to the displayed size. Returns true when the size changed. */
  resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxDim = this.device.limits.maxTextureDimension2D;
    const width = Math.max(1, Math.min(maxDim, Math.floor(this.canvas.clientWidth * dpr)));
    const height = Math.max(1, Math.min(maxDim, Math.floor(this.canvas.clientHeight * dpr)));
    if (width === this.width && height === this.height && this.depthTexture) return false;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      label: 'depth buffer',
      size: { width, height },
      format: GpuContext.DEPTH_FORMAT,
      // Sampled by the water pass (read-only attachment) for depth-based transparency.
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.depthView = this.depthTexture.createView();
    if (this.offscreen) {
      this.offscreenTexture?.destroy();
      this.offscreenTexture = this.device.createTexture({
        label: 'offscreen colour target',
        size: { width, height },
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      this.offscreenView = this.offscreenTexture.createView();
    }
    return true;
  }

  /** Colour target for this frame: the swap chain texture, or the offscreen texture. */
  currentColorView(): GPUTextureView {
    return this.context ? this.context.getCurrentTexture().createView() : this.offscreenView!;
  }

  /** Reads back the last rendered frame (offscreen mode only). */
  async captureFrame(): Promise<CapturedFrame> {
    const texture = this.offscreenTexture;
    if (!texture) throw new Error('frame capture requires offscreen mode');
    const { width, height } = texture;
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = this.device.createBuffer({
      label: 'frame capture',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder({ label: 'frame capture' });
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, { width, height });
    this.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(buffer.getMappedRange());
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) pixels.set(padded.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
    buffer.unmap();
    buffer.destroy();
    return { width, height, pixels };
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }
}

/** Creates a shader module and surfaces WGSL compilation errors with line information. */
export async function createShaderModule(device: GPUDevice, label: string, code: string): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  for (const m of info.messages) {
    const line = code.split('\n')[m.lineNum - 1] ?? '';
    const text = `[${label}] ${m.type} at ${m.lineNum}:${m.linePos}: ${m.message}\n    ${line.trim()}`;
    if (m.type === 'error') console.error(text);
    else console.warn(text);
  }
  if (errors.length > 0) {
    throw new Error(`WGSL compilation failed for ${label}: ${errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('; ')}`);
  }
  return module;
}
