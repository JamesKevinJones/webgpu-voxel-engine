import { GpuContext, createShaderModule } from '../core/gpu-context';
import skySource from '../shaders/sky.wgsl';
import terrainSource from '../shaders/terrain.wgsl';
import { INDIRECT_ARGS_BYTES, OPAQUE_VERTEX_CAPACITY, WATER_VERTEX_CAPACITY } from '../world/mesh-format';
import { withPrelude } from './shader-prelude';
import type { WorldGpu } from './world-gpu';

export interface DrawLists {
  /** Mesh slots with opaque geometry, ideally sorted front to back. */
  opaque: readonly number[];
  /** Mesh slots with water geometry, sorted back to front. */
  water: readonly number[];
}

/**
 * Render pipelines: full-screen sky, opaque terrain (depth write, back-face culling) and
 * alpha-blended water. Terrain geometry is fetched from storage buffers in the vertex shader
 * and every chunk is drawn with one drawIndexedIndirect call whose arguments the mesher wrote.
 */
export class Renderer {
  private constructor(
    private readonly world: WorldGpu,
    private readonly skyPipeline: GPURenderPipeline,
    private readonly opaquePipeline: GPURenderPipeline,
    private readonly waterPipeline: GPURenderPipeline,
    private readonly skyBindGroup: GPUBindGroup,
    private readonly opaqueBindGroup: GPUBindGroup,
    private readonly waterBindGroup: GPUBindGroup,
  ) {}

  static async create(device: GPUDevice, format: GPUTextureFormat, world: WorldGpu, frameUniforms: GPUBuffer): Promise<Renderer> {
    const [skyModule, terrainModule] = await Promise.all([
      createShaderModule(device, 'sky.wgsl', withPrelude(skySource)),
      createShaderModule(device, 'terrain.wgsl', withPrelude(terrainSource)),
    ]);

    const skyLayout = device.createBindGroupLayout({
      label: 'sky layout',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const terrainLayout = device.createBindGroupLayout({
      label: 'terrain layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const depthFormat = GpuContext.DEPTH_FORMAT;
    const skyPipeline = device.createRenderPipelineAsync({
      label: 'sky pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [skyLayout] }),
      vertex: { module: skyModule, entryPoint: 'vs_main' },
      fragment: { module: skyModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'always' },
    });
    const terrainPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [terrainLayout] });
    const opaquePipeline = device.createRenderPipelineAsync({
      label: 'opaque terrain pipeline',
      layout: terrainPipelineLayout,
      vertex: { module: terrainModule, entryPoint: 'vs_main', constants: { VERTEX_CAPACITY: OPAQUE_VERTEX_CAPACITY } },
      fragment: { module: terrainModule, entryPoint: 'fs_opaque', targets: [{ format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less' },
    });
    const waterPipeline = device.createRenderPipelineAsync({
      label: 'water pipeline',
      layout: terrainPipelineLayout,
      vertex: { module: terrainModule, entryPoint: 'vs_main', constants: { VERTEX_CAPACITY: WATER_VERTEX_CAPACITY } },
      fragment: {
        module: terrainModule,
        entryPoint: 'fs_water',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      // Water is visible from below as well, so it is not culled.
      primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
      depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: 'less' },
    });

    const skyBindGroup = device.createBindGroup({
      label: 'sky bind group',
      layout: skyLayout,
      entries: [{ binding: 0, resource: { buffer: frameUniforms } }],
    });
    const terrainGroup = (label: string, vertices: GPUBuffer): GPUBindGroup => device.createBindGroup({
      label,
      layout: terrainLayout,
      entries: [
        { binding: 0, resource: { buffer: frameUniforms } },
        { binding: 1, resource: { buffer: vertices } },
        { binding: 2, resource: { buffer: world.chunkOrigins } },
      ],
    });

    return new Renderer(
      world,
      await skyPipeline,
      await opaquePipeline,
      await waterPipeline,
      skyBindGroup,
      terrainGroup('opaque terrain bind group', world.opaqueVertices),
      terrainGroup('water terrain bind group', world.waterVertices),
    );
  }

  render(encoder: GPUCommandEncoder, colorView: GPUTextureView, depthView: GPUTextureView, draws: DrawLists): void {
    const pass = encoder.beginRenderPass({
      label: 'main render pass',
      colorAttachments: [{ view: colorView, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });

    pass.setPipeline(this.skyPipeline);
    pass.setBindGroup(0, this.skyBindGroup);
    pass.draw(3);

    pass.setIndexBuffer(this.world.indexBuffer, 'uint16');
    if (draws.opaque.length > 0) {
      pass.setPipeline(this.opaquePipeline);
      pass.setBindGroup(0, this.opaqueBindGroup);
      for (const slot of draws.opaque) pass.drawIndexedIndirect(this.world.opaqueArgs, slot * INDIRECT_ARGS_BYTES);
    }
    if (draws.water.length > 0) {
      pass.setPipeline(this.waterPipeline);
      pass.setBindGroup(0, this.waterBindGroup);
      for (const slot of draws.water) pass.drawIndexedIndirect(this.world.waterArgs, slot * INDIRECT_ARGS_BYTES);
    }
    pass.end();
  }
}
