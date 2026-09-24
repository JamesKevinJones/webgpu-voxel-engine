import { createShaderModule } from '../core/gpu-context';
import { CHUNK_SIZE } from '../world/coords';
import type { GenerationJob, MeshJob } from '../world/chunk-manager';
import {
  INDIRECT_ARGS_BYTES,
  INDIRECT_ARGS_WORDS,
  CUTOUT_VERTEX_CAPACITY,
  MESH_COUNTER_WORDS,
  MESH_JOB_NEIGHBOR_OFFSET,
  MESH_JOB_WORDS,
  OPAQUE_QUAD_CAPACITY,
  OPAQUE_VERTEX_CAPACITY,
  PADDED_WORDS,
  QUAD_INDEX_PATTERN,
  WATER_VERTEX_CAPACITY,
} from '../world/mesh-format';
import { GPU_DATA_WORDS, GPU_SLOT_WORDS, type PalettedChunk } from '../world/palette-chunk';
import gatherSource from '../shaders/gather.wgsl';
import meshSource from '../shaders/mesh.wgsl';
import worldgenSource from '../shaders/worldgen.wgsl';
import { withPrelude } from './shader-prelude';

export const VOXEL_SLOT_BYTES = GPU_SLOT_WORDS * 4;
export const OPAQUE_SLOT_BYTES = OPAQUE_VERTEX_CAPACITY * 4;
export const WATER_SLOT_BYTES = WATER_VERTEX_CAPACITY * 4;
export const CUTOUT_SLOT_BYTES = CUTOUT_VERTEX_CAPACITY * 4;
/** Number of vertex pools (opaque, water, cutout) and indirect records per mesh slot. */
export const MESH_POOL_COUNT = 3;
/** Byte offset of a slot's drawIndexedIndirect record for `pool` in `indirectArgs`. */
export function indirectOffset(slot: number, pool: number): number {
  return (slot * MESH_POOL_COUNT + pool) * INDIRECT_ARGS_BYTES;
}
const POOL_VERTEX_CAPACITY = [OPAQUE_VERTEX_CAPACITY, WATER_VERTEX_CAPACITY, CUTOUT_VERTEX_CAPACITY] as const;
/** One invocation per data word (4 voxels at 8 bits), 64 invocations per workgroup → 128 workgroups per chunk. */
const GEN_WORKGROUPS_PER_CHUNK = GPU_DATA_WORDS / 64;
const GATHER_WORKGROUPS = Math.ceil(PADDED_WORDS / 64);

export interface WorldGpuConfig {
  voxelSlots: number;
  meshSlots: number;
  maxGenJobs: number;
  maxMeshJobs: number;
  seed: number;
}

/** Clamps requested pool sizes to what the device's buffer limits allow. */
export function fitSlotsToLimits(
  limits: Pick<GPUSupportedLimits, 'maxStorageBufferBindingSize' | 'maxBufferSize'>,
  requested: { voxelSlots: number; meshSlots: number },
): { voxelSlots: number; meshSlots: number } {
  const maxBinding = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
  return {
    voxelSlots: Math.max(1, Math.min(requested.voxelSlots, Math.floor(maxBinding / VOXEL_SLOT_BYTES))),
    meshSlots: Math.max(1, Math.min(requested.meshSlots, Math.floor(maxBinding / OPAQUE_SLOT_BYTES))),
  };
}

/**
 * GPU resources and compute passes for the voxel world:
 *  - voxel pool: palette-compressed chunk slots written by the worldgen pass / CPU edits,
 *  - gather + greedy mesh passes writing packed vertices into fixed-capacity per-chunk regions
 *    of the opaque / water vertex pools,
 *  - one drawIndexedIndirect record per mesh slot and pool, filled by atomics in the mesher.
 */
export class WorldGpu {
  readonly voxelPool: GPUBuffer;
  readonly opaqueVertices: GPUBuffer;
  readonly waterVertices: GPUBuffer;
  readonly cutoutVertices: GPUBuffer;
  /** drawIndexedIndirect records, MESH_POOL_COUNT per mesh slot (see `indirectOffset`). */
  readonly indirectArgs: GPUBuffer;
  readonly counters: GPUBuffer;
  readonly chunkOrigins: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  private readonly padded: GPUBuffer;
  private readonly genParams: GPUBuffer;
  private readonly genJobs: GPUBuffer;
  private readonly meshJobs: GPUBuffer;
  private readonly genJobData: Int32Array<ArrayBuffer>;
  private readonly meshJobData: Uint32Array<ArrayBuffer>;
  private readonly argsReset = new Uint32Array(INDIRECT_ARGS_WORDS * MESH_POOL_COUNT);
  private readonly counterReset = new Uint32Array(MESH_COUNTER_WORDS);
  private readonly originData = new Int32Array(4);
  private readonly uploadScratch = new Uint32Array(GPU_SLOT_WORDS);
  private readonly genBindGroup: GPUBindGroup;
  private readonly gatherBindGroup: GPUBindGroup;
  private readonly meshBindGroup: GPUBindGroup;

  private constructor(
    private readonly device: GPUDevice,
    readonly config: WorldGpuConfig,
    private readonly genPipeline: GPUComputePipeline,
    private readonly gatherPipeline: GPUComputePipeline,
    private readonly meshPipeline: GPUComputePipeline,
  ) {
    const { voxelSlots, meshSlots, maxGenJobs, maxMeshJobs } = config;
    const storage = GPUBufferUsage.STORAGE;
    this.voxelPool = device.createBuffer({
      label: 'voxel pool',
      size: voxelSlots * VOXEL_SLOT_BYTES,
      usage: storage | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.opaqueVertices = device.createBuffer({ label: 'opaque vertex pool', size: meshSlots * OPAQUE_SLOT_BYTES, usage: storage });
    this.waterVertices = device.createBuffer({ label: 'water vertex pool', size: meshSlots * WATER_SLOT_BYTES, usage: storage });
    this.cutoutVertices = device.createBuffer({ label: 'cutout vertex pool', size: meshSlots * CUTOUT_SLOT_BYTES, usage: storage });
    this.indirectArgs = device.createBuffer({
      label: 'indirect args',
      size: meshSlots * MESH_POOL_COUNT * INDIRECT_ARGS_BYTES,
      usage: storage | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
    });
    this.counters = device.createBuffer({
      label: 'mesh quad counters',
      size: meshSlots * MESH_COUNTER_WORDS * 4,
      usage: storage | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.chunkOrigins = device.createBuffer({ label: 'chunk origins', size: meshSlots * 16, usage: storage | GPUBufferUsage.COPY_DST });
    this.padded = device.createBuffer({ label: 'padded voxel scratch', size: maxMeshJobs * PADDED_WORDS * 4, usage: storage });
    this.genParams = device.createBuffer({ label: 'worldgen params', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.genJobs = device.createBuffer({ label: 'worldgen jobs', size: maxGenJobs * 16, usage: storage | GPUBufferUsage.COPY_DST });
    this.meshJobs = device.createBuffer({ label: 'mesh jobs', size: maxMeshJobs * MESH_JOB_WORDS * 4, usage: storage | GPUBufferUsage.COPY_DST });
    this.genJobData = new Int32Array(maxGenJobs * 4);
    this.meshJobData = new Uint32Array(maxMeshJobs * MESH_JOB_WORDS);

    // Shared quad index buffer: 16-bit indices are enough because baseVertex selects the slot.
    const indices = new Uint16Array(OPAQUE_QUAD_CAPACITY * 6);
    for (let q = 0; q < OPAQUE_QUAD_CAPACITY; q++) {
      for (let k = 0; k < 6; k++) indices[q * 6 + k] = q * 4 + QUAD_INDEX_PATTERN[k]!;
    }
    this.indexBuffer = device.createBuffer({ label: 'quad indices', size: indices.byteLength, usage: GPUBufferUsage.INDEX, mappedAtCreation: true });
    new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    // Every indirect record starts as an empty draw with the slot's base vertex.
    const initArgs = new Uint32Array(meshSlots * MESH_POOL_COUNT * INDIRECT_ARGS_WORDS);
    for (let s = 0; s < meshSlots; s++) {
      for (let p = 0; p < MESH_POOL_COUNT; p++) {
        const o = (s * MESH_POOL_COUNT + p) * INDIRECT_ARGS_WORDS;
        initArgs[o + 1] = 1;
        initArgs[o + 3] = s * POOL_VERTEX_CAPACITY[p]!;
      }
    }
    device.queue.writeBuffer(this.indirectArgs, 0, initArgs);
    device.queue.writeBuffer(this.genParams, 0, new Uint32Array([config.seed >>> 0, 0, 0, 0]));

    this.genBindGroup = device.createBindGroup({
      label: 'worldgen bind group',
      layout: genPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.genParams } },
        { binding: 1, resource: { buffer: this.genJobs } },
        { binding: 2, resource: { buffer: this.voxelPool } },
      ],
    });
    this.gatherBindGroup = device.createBindGroup({
      label: 'gather bind group',
      layout: gatherPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.voxelPool } },
        { binding: 1, resource: { buffer: this.meshJobs } },
        { binding: 2, resource: { buffer: this.padded } },
      ],
    });
    this.meshBindGroup = device.createBindGroup({
      label: 'mesh bind group',
      layout: meshPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.padded } },
        { binding: 1, resource: { buffer: this.meshJobs } },
        { binding: 2, resource: { buffer: this.opaqueVertices } },
        { binding: 3, resource: { buffer: this.waterVertices } },
        { binding: 4, resource: { buffer: this.cutoutVertices } },
        { binding: 5, resource: { buffer: this.indirectArgs } },
        { binding: 6, resource: { buffer: this.counters } },
      ],
    });
  }

  static async create(device: GPUDevice, config: WorldGpuConfig): Promise<WorldGpu> {
    const [genModule, gatherModule, meshModule] = await Promise.all([
      createShaderModule(device, 'worldgen.wgsl', withPrelude(worldgenSource)),
      createShaderModule(device, 'gather.wgsl', withPrelude(gatherSource)),
      createShaderModule(device, 'mesh.wgsl', withPrelude(meshSource)),
    ]);
    const [genPipeline, gatherPipeline, meshPipeline] = await Promise.all([
      device.createComputePipelineAsync({ label: 'worldgen', layout: 'auto', compute: { module: genModule, entryPoint: 'main' } }),
      device.createComputePipelineAsync({ label: 'gather', layout: 'auto', compute: { module: gatherModule, entryPoint: 'main' } }),
      device.createComputePipelineAsync({ label: 'greedy mesh', layout: 'auto', compute: { module: meshModule, entryPoint: 'main' } }),
    ]);
    return new WorldGpu(device, config, genPipeline, gatherPipeline, meshPipeline);
  }

  /** Bytes allocated for all pools (for the stats overlay). */
  get allocatedBytes(): number {
    return this.voxelPool.size + this.opaqueVertices.size + this.waterVertices.size + this.cutoutVertices.size +
      this.indirectArgs.size + this.counters.size + this.chunkOrigins.size + this.padded.size + this.indexBuffer.size;
  }

  /**
   * Encodes the worldgen pass for `jobs` and copies each generated slot into `staging`
   * (job i at byte offset i * VOXEL_SLOT_BYTES) for the CPU copy.
   */
  encodeGeneration(encoder: GPUCommandEncoder, jobs: readonly GenerationJob[], staging: GPUBuffer | null): void {
    if (jobs.length === 0) return;
    if (jobs.length > this.config.maxGenJobs) throw new RangeError('too many generation jobs');
    const data = this.genJobData;
    jobs.forEach((job, i) => {
      data[i * 4] = job.record.cx;
      data[i * 4 + 1] = job.record.cy;
      data[i * 4 + 2] = job.record.cz;
      data[i * 4 + 3] = job.voxelSlot;
    });
    this.device.queue.writeBuffer(this.genJobs, 0, data, 0, jobs.length * 4);
    const pass = encoder.beginComputePass({ label: 'worldgen pass' });
    pass.setPipeline(this.genPipeline);
    pass.setBindGroup(0, this.genBindGroup);
    pass.dispatchWorkgroups(GEN_WORKGROUPS_PER_CHUNK, jobs.length, 1);
    pass.end();
    if (staging) {
      jobs.forEach((job, i) => {
        encoder.copyBufferToBuffer(this.voxelPool, job.voxelSlot * VOXEL_SLOT_BYTES, staging, i * VOXEL_SLOT_BYTES, VOXEL_SLOT_BYTES);
      });
    }
  }

  /**
   * Encodes gather + greedy-mesh passes for `jobs`. Each job's indirect records and counters are
   * reset first; afterwards the quad counters of every job are copied into `staging`
   * (job i at byte offset i * MESH_COUNTER_WORDS * 4).
   */
  encodeMeshing(encoder: GPUCommandEncoder, jobs: readonly MeshJob[], staging: GPUBuffer | null): void {
    if (jobs.length === 0) return;
    if (jobs.length > this.config.maxMeshJobs) throw new RangeError('too many mesh jobs');
    const queue = this.device.queue;
    const jobData = this.meshJobData;
    jobData.fill(0);
    jobs.forEach((job, i) => {
      const slot = job.meshSlot;
      jobData[i * MESH_JOB_WORDS] = slot;
      jobData.set(job.neighborSlots, i * MESH_JOB_WORDS + MESH_JOB_NEIGHBOR_OFFSET);

      for (let p = 0; p < MESH_POOL_COUNT; p++) {
        this.argsReset.set([0, 1, 0, slot * POOL_VERTEX_CAPACITY[p]!, 0], p * INDIRECT_ARGS_WORDS);
      }
      queue.writeBuffer(this.indirectArgs, indirectOffset(slot, 0), this.argsReset);
      queue.writeBuffer(this.counters, slot * MESH_COUNTER_WORDS * 4, this.counterReset);
      this.originData.set([job.record.cx * CHUNK_SIZE, job.record.cy * CHUNK_SIZE, job.record.cz * CHUNK_SIZE, 0]);
      queue.writeBuffer(this.chunkOrigins, slot * 16, this.originData);
    });
    queue.writeBuffer(this.meshJobs, 0, jobData, 0, jobs.length * MESH_JOB_WORDS);

    const gather = encoder.beginComputePass({ label: 'gather pass' });
    gather.setPipeline(this.gatherPipeline);
    gather.setBindGroup(0, this.gatherBindGroup);
    gather.dispatchWorkgroups(GATHER_WORKGROUPS, jobs.length, 1);
    gather.end();

    const mesh = encoder.beginComputePass({ label: 'greedy mesh pass' });
    mesh.setPipeline(this.meshPipeline);
    mesh.setBindGroup(0, this.meshBindGroup);
    mesh.dispatchWorkgroups(CHUNK_SIZE, 6, jobs.length);
    mesh.end();

    if (staging) {
      jobs.forEach((job, i) => {
        encoder.copyBufferToBuffer(this.counters, job.meshSlot * MESH_COUNTER_WORDS * 4, staging, i * MESH_COUNTER_WORDS * 4, MESH_COUNTER_WORDS * 4);
      });
    }
  }

  /** Uploads a CPU-edited chunk into its voxel slot. */
  uploadChunk(slot: number, chunk: PalettedChunk): void {
    const words = chunk.writeGpuLayout(this.uploadScratch);
    this.device.queue.writeBuffer(this.voxelPool, slot * VOXEL_SLOT_BYTES, this.uploadScratch, 0, words);
  }

  destroy(): void {
    for (const b of [this.voxelPool, this.opaqueVertices, this.waterVertices, this.cutoutVertices, this.indirectArgs, this.counters,
      this.chunkOrigins, this.indexBuffer, this.padded, this.genParams, this.genJobs, this.meshJobs]) {
      b.destroy();
    }
  }
}
