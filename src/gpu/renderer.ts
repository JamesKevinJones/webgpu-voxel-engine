import { GpuContext, createShaderModule } from '../core/gpu-context';
import { MAX_PARTICLES, PARTICLE_BYTES, PARTICLE_FLOATS, PARTICLE_GRAVITY, type SlotRange } from '../fx/particles';
import overlaySource from '../shaders/overlay.wgsl';
import particlesSource from '../shaders/particles.wgsl';
import shadowSource from '../shaders/shadow.wgsl';
import skySource from '../shaders/sky.wgsl';
import terrainSource from '../shaders/terrain.wgsl';
import { CUTOUT_VERTEX_CAPACITY, OPAQUE_VERTEX_CAPACITY, WATER_VERTEX_CAPACITY } from '../world/mesh-format';
import { createBlockTextureArray } from './block-textures';
import { withPrelude } from './shader-prelude';
import { indirectOffset, type WorldGpu } from './world-gpu';

export const SHADOW_CASCADES = 2;
export const SHADOW_MAP_SIZE = 2048;

export interface DrawLists {
  /** Mesh slots with opaque geometry, ideally sorted front to back. */
  opaque: readonly number[];
  /** Mesh slots with alpha-tested geometry (glass, plants). */
  cutout: readonly number[];
  /** Mesh slots with water geometry, sorted back to front. */
  water: readonly number[];
  /** Per cascade: mesh slots whose opaque geometry may cast into it (empty arrays = no shadows). */
  shadow: readonly (readonly number[])[];
}

export interface OverlayState {
  /** Minimum corner of the targeted voxel, or null. */
  target: [number, number, number] | null;
  /** Mining crack stage 0..9, or -1. */
  crackStage: number;
}

/**
 * Render pipelines:
 *  1. shadow passes: opaque chunk geometry → one layer per cascade of a depth32float array,
 *  2. main pass: sky, opaque terrain (back-face culled), alpha-tested cutout geometry,
 *  3. overlay pass (depth read-only): water with depth-based absorption, target box and crack
 *     overlays, instanced debris particles.
 * Terrain geometry is fetched from storage buffers in the vertex shader and every chunk is drawn
 * with one drawIndexedIndirect call whose arguments the GPU mesher wrote.
 */
export class Renderer {
  private depthGroupView: GPUTextureView | null = null;
  private depthGroup: GPUBindGroup | null = null;
  private readonly overlayData = new Float32Array(8);
  private readonly simData = new ArrayBuffer(16);

  private constructor(
    private readonly device: GPUDevice,
    private readonly world: WorldGpu,
    private readonly p: {
      sky: GPURenderPipeline;
      opaque: GPURenderPipeline;
      cutout: GPURenderPipeline;
      water: GPURenderPipeline;
      shadow: GPURenderPipeline[];
      box: GPURenderPipeline;
      crack: GPURenderPipeline;
      particles: GPURenderPipeline;
      simulate: GPUComputePipeline;
    },
    private readonly g: {
      sky: GPUBindGroup;
      opaque: GPUBindGroup;
      cutout: GPUBindGroup;
      water: GPUBindGroup;
      shadow: GPUBindGroup;
      overlay: GPUBindGroup;
      particles: GPUBindGroup;
      simulate: GPUBindGroup;
    },
    private readonly depthLayout: GPUBindGroupLayout,
    private readonly shadowViews: GPUTextureView[],
    private readonly overlayBuffer: GPUBuffer,
    readonly particleBuffer: GPUBuffer,
    private readonly simBuffer: GPUBuffer,
  ) {}

  static async create(device: GPUDevice, format: GPUTextureFormat, world: WorldGpu, frameUniforms: GPUBuffer): Promise<Renderer> {
    const [skyModule, terrainModule, shadowModule, overlayModule, particleModule] = await Promise.all([
      createShaderModule(device, 'sky.wgsl', withPrelude(skySource)),
      createShaderModule(device, 'terrain.wgsl', withPrelude(terrainSource)),
      createShaderModule(device, 'shadow.wgsl', withPrelude(shadowSource)),
      createShaderModule(device, 'overlay.wgsl', withPrelude(overlaySource)),
      createShaderModule(device, 'particles.wgsl', withPrelude(particlesSource)),
    ]);

    const VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
    const uniformEntry = (binding: number, visibility: number): GPUBindGroupLayoutEntry => ({ binding, visibility, buffer: { type: 'uniform' } });
    const skyLayout = device.createBindGroupLayout({ label: 'sky layout', entries: [uniformEntry(0, VS | FS)] });
    const terrainLayout = device.createBindGroupLayout({
      label: 'terrain layout',
      entries: [
        uniformEntry(0, VS | FS),
        { binding: 1, visibility: VS, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: VS, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: FS, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 4, visibility: FS, sampler: { type: 'filtering' } },
        { binding: 5, visibility: FS, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
        { binding: 6, visibility: FS, sampler: { type: 'comparison' } },
      ],
    });
    const depthLayout = device.createBindGroupLayout({
      label: 'scene depth layout',
      entries: [{ binding: 0, visibility: FS, texture: { sampleType: 'depth' } }],
    });
    const shadowLayout = device.createBindGroupLayout({
      label: 'shadow layout',
      entries: [
        uniformEntry(0, VS),
        { binding: 1, visibility: VS, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: VS, buffer: { type: 'read-only-storage' } },
      ],
    });
    const overlayLayout = device.createBindGroupLayout({
      label: 'overlay layout',
      entries: [
        uniformEntry(0, VS | FS),
        uniformEntry(1, VS | FS),
        { binding: 2, visibility: FS, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 3, visibility: FS, sampler: { type: 'filtering' } },
      ],
    });
    const particleLayout = device.createBindGroupLayout({
      label: 'particle render layout',
      entries: [
        uniformEntry(0, VS | FS),
        { binding: 3, visibility: FS, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 4, visibility: FS, sampler: { type: 'filtering' } },
        { binding: 5, visibility: VS, buffer: { type: 'read-only-storage' } },
      ],
    });

    const blocks = createBlockTextureArray(device);
    const blockView = blocks.texture.createView({ dimension: '2d-array' });
    const shadowTexture = device.createTexture({
      label: 'cascaded shadow map',
      size: { width: SHADOW_MAP_SIZE, height: SHADOW_MAP_SIZE, depthOrArrayLayers: SHADOW_CASCADES },
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const shadowArrayView = shadowTexture.createView({ dimension: '2d-array' });
    const shadowViews = Array.from({ length: SHADOW_CASCADES }, (_, i) =>
      shadowTexture.createView({ dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1 }));
    const shadowSampler = device.createSampler({
      label: 'shadow comparison sampler',
      compare: 'less-equal',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    const depthFormat = GpuContext.DEPTH_FORMAT;
    const alphaBlend: GPUBlendState = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    const terrainPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [terrainLayout] });
    const terrainPipeline = (label: string, fragment: string, capacity: number, cull: GPUCullMode, blend?: GPUBlendState,
      layout = terrainPipelineLayout, depthWrite = true) => device.createRenderPipelineAsync({
      label,
      layout,
      vertex: { module: terrainModule, entryPoint: 'vs_main', constants: { VERTEX_CAPACITY: capacity } },
      fragment: { module: terrainModule, entryPoint: fragment, targets: [{ format, ...(blend ? { blend } : {}) }] },
      primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
      depthStencil: { format: depthFormat, depthWriteEnabled: depthWrite, depthCompare: 'less' },
    });
    const overlayPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [overlayLayout] });
    const overlayDepth: GPUDepthStencilState = { format: depthFormat, depthWriteEnabled: false, depthCompare: 'less-equal' };

    const simulatePromise = device.createComputePipelineAsync({
      label: 'particle simulation', layout: 'auto', compute: { module: particleModule, entryPoint: 'simulate' },
    });
    const [sky, opaque, cutout, water, shadow0, shadow1, box, crack, particles] = await Promise.all([
      device.createRenderPipelineAsync({
        label: 'sky pipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [skyLayout] }),
        vertex: { module: skyModule, entryPoint: 'vs_main' },
        fragment: { module: skyModule, entryPoint: 'fs_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'always' },
      }),
      terrainPipeline('opaque terrain pipeline', 'fs_opaque', OPAQUE_VERTEX_CAPACITY, 'back'),
      // Glass panes and plants are visible from both sides.
      terrainPipeline('cutout pipeline', 'fs_cutout', CUTOUT_VERTEX_CAPACITY, 'none'),
      terrainPipeline('water pipeline', 'fs_water', WATER_VERTEX_CAPACITY, 'none', alphaBlend,
        device.createPipelineLayout({ bindGroupLayouts: [terrainLayout, depthLayout] }), false),
      ...Array.from({ length: SHADOW_CASCADES }, (_, i) => device.createRenderPipelineAsync({
        label: `shadow pipeline ${i}`,
        layout: device.createPipelineLayout({ bindGroupLayouts: [shadowLayout] }),
        vertex: { module: shadowModule, entryPoint: 'vs_shadow', constants: { VERTEX_CAPACITY: OPAQUE_VERTEX_CAPACITY, CASCADE: i } },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBiasSlopeScale: 1.5 },
      })),
      device.createRenderPipelineAsync({
        label: 'target box pipeline',
        layout: overlayPipelineLayout,
        vertex: { module: overlayModule, entryPoint: 'vs_box' },
        fragment: { module: overlayModule, entryPoint: 'fs_box', targets: [{ format, blend: alphaBlend }] },
        primitive: { topology: 'line-list' },
        depthStencil: overlayDepth,
      }),
      device.createRenderPipelineAsync({
        label: 'crack overlay pipeline',
        layout: overlayPipelineLayout,
        vertex: { module: overlayModule, entryPoint: 'vs_crack' },
        fragment: { module: overlayModule, entryPoint: 'fs_crack', targets: [{ format, blend: alphaBlend }] },
        primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
        depthStencil: overlayDepth,
      }),
      device.createRenderPipelineAsync({
        label: 'particle pipeline',
        layout: device.createPipelineLayout({ bindGroupLayouts: [particleLayout] }),
        vertex: { module: particleModule, entryPoint: 'vs_particle' },
        fragment: { module: particleModule, entryPoint: 'fs_particle', targets: [{ format }] },
        primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
        depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'less' },
      }),
    ]);
    const simulate = await simulatePromise;

    const overlayBuffer = device.createBuffer({ label: 'overlay uniforms', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const particleBuffer = device.createBuffer({
      label: 'particles',
      size: MAX_PARTICLES * PARTICLE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const simBuffer = device.createBuffer({ label: 'particle sim params', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const frame = { binding: 0, resource: { buffer: frameUniforms } };
    const terrainGroup = (label: string, vertices: GPUBuffer): GPUBindGroup => device.createBindGroup({
      label,
      layout: terrainLayout,
      entries: [
        frame,
        { binding: 1, resource: { buffer: vertices } },
        { binding: 2, resource: { buffer: world.chunkOrigins } },
        { binding: 3, resource: blockView },
        { binding: 4, resource: blocks.sampler },
        { binding: 5, resource: shadowArrayView },
        { binding: 6, resource: shadowSampler },
      ],
    });
    const groups = {
      sky: device.createBindGroup({ label: 'sky bind group', layout: skyLayout, entries: [frame] }),
      opaque: terrainGroup('opaque terrain bind group', world.opaqueVertices),
      cutout: terrainGroup('cutout bind group', world.cutoutVertices),
      water: terrainGroup('water bind group', world.waterVertices),
      shadow: device.createBindGroup({
        label: 'shadow bind group',
        layout: shadowLayout,
        entries: [frame, { binding: 1, resource: { buffer: world.opaqueVertices } }, { binding: 2, resource: { buffer: world.chunkOrigins } }],
      }),
      overlay: device.createBindGroup({
        label: 'overlay bind group',
        layout: overlayLayout,
        entries: [frame, { binding: 1, resource: { buffer: overlayBuffer } }, { binding: 2, resource: blockView }, { binding: 3, resource: blocks.sampler }],
      }),
      particles: device.createBindGroup({
        label: 'particle render bind group',
        layout: particleLayout,
        entries: [frame, { binding: 3, resource: blockView }, { binding: 4, resource: blocks.sampler }, { binding: 5, resource: { buffer: particleBuffer } }],
      }),
      simulate: device.createBindGroup({
        label: 'particle sim bind group',
        layout: simulate.getBindGroupLayout(0),
        entries: [{ binding: 1, resource: { buffer: particleBuffer } }, { binding: 2, resource: { buffer: simBuffer } }],
      }),
    };
    return new Renderer(
      device, world,
      { sky: sky!, opaque: opaque!, cutout: cutout!, water: water!, shadow: [shadow0!, shadow1!], box: box!, crack: crack!, particles: particles!, simulate },
      groups, depthLayout, shadowViews, overlayBuffer, particleBuffer, simBuffer,
    );
  }

  /** Uploads freshly spawned particles (ranges of the CPU ring copy). */
  uploadParticles(data: Float32Array<ArrayBuffer>, ranges: readonly SlotRange[]): void {
    for (const r of ranges) {
      this.device.queue.writeBuffer(this.particleBuffer, r.first * PARTICLE_BYTES, data, r.first * PARTICLE_FLOATS, r.count * PARTICLE_FLOATS);
    }
  }

  /** Encodes the particle simulation step. */
  simulateParticles(encoder: GPUCommandEncoder, dt: number): void {
    const f = new Float32Array(this.simData), u = new Uint32Array(this.simData);
    f[0] = dt;
    f[1] = PARTICLE_GRAVITY;
    u[2] = MAX_PARTICLES;
    this.device.queue.writeBuffer(this.simBuffer, 0, this.simData);
    const pass = encoder.beginComputePass({ label: 'particle simulation' });
    pass.setPipeline(this.p.simulate);
    pass.setBindGroup(0, this.g.simulate);
    pass.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / 64));
    pass.end();
  }

  render(encoder: GPUCommandEncoder, colorView: GPUTextureView, depthView: GPUTextureView, draws: DrawLists, overlay: OverlayState): void {
    const args = this.world.indirectArgs;
    const index = this.world.indexBuffer;

    // 1. Shadow cascades.
    draws.shadow.forEach((slots, cascade) => {
      const pass = encoder.beginRenderPass({
        label: `shadow cascade ${cascade}`,
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowViews[cascade]!, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      if (slots.length > 0) {
        pass.setIndexBuffer(index, 'uint16');
        pass.setPipeline(this.p.shadow[cascade]!);
        pass.setBindGroup(0, this.g.shadow);
        for (const slot of slots) pass.drawIndexedIndirect(args, indirectOffset(slot, 0));
      }
      pass.end();
    });

    // 2. Sky, opaque and cutout geometry.
    const pass = encoder.beginRenderPass({
      label: 'main render pass',
      colorAttachments: [{ view: colorView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setPipeline(this.p.sky);
    pass.setBindGroup(0, this.g.sky);
    pass.draw(3);
    pass.setIndexBuffer(index, 'uint16');
    if (draws.opaque.length > 0) {
      pass.setPipeline(this.p.opaque);
      pass.setBindGroup(0, this.g.opaque);
      for (const slot of draws.opaque) pass.drawIndexedIndirect(args, indirectOffset(slot, 0));
    }
    if (draws.cutout.length > 0) {
      pass.setPipeline(this.p.cutout);
      pass.setBindGroup(0, this.g.cutout);
      for (const slot of draws.cutout) pass.drawIndexedIndirect(args, indirectOffset(slot, 2));
    }
    pass.end();

    // 3. Water, overlays and particles with a read-only depth buffer (sampled by the water shader).
    const o = this.overlayData;
    o.fill(0);
    if (overlay.target) {
      o.set(overlay.target, 0);
      o[3] = 1;
    }
    o[4] = overlay.crackStage;
    this.device.queue.writeBuffer(this.overlayBuffer, 0, o);
    const late = encoder.beginRenderPass({
      label: 'water and overlay pass',
      colorAttachments: [{ view: colorView, loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: depthView, depthReadOnly: true },
    });
    late.setPipeline(this.p.particles);
    late.setBindGroup(0, this.g.particles);
    late.draw(36, MAX_PARTICLES);
    if (draws.water.length > 0) {
      late.setIndexBuffer(index, 'uint16');
      late.setPipeline(this.p.water);
      late.setBindGroup(0, this.g.water);
      late.setBindGroup(1, this.sceneDepthGroup(depthView));
      for (const slot of draws.water) late.drawIndexedIndirect(args, indirectOffset(slot, 1));
    }
    if (overlay.target) {
      late.setBindGroup(0, this.g.overlay);
      if (overlay.crackStage >= 0) {
        late.setPipeline(this.p.crack);
        late.draw(36);
      }
      late.setPipeline(this.p.box);
      late.draw(24);
    }
    late.end();
  }

  /** Bind group exposing the depth buffer to the water shader; rebuilt when the buffer is resized. */
  private sceneDepthGroup(depthView: GPUTextureView): GPUBindGroup {
    if (this.depthGroupView !== depthView || !this.depthGroup) {
      this.depthGroupView = depthView;
      this.depthGroup = this.device.createBindGroup({
        label: 'scene depth bind group',
        layout: this.depthLayout,
        entries: [{ binding: 0, resource: depthView }],
      });
    }
    return this.depthGroup;
  }
}
