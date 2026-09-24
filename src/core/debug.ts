import { isOpaque } from '../world/block';
import { CHUNK_SIZE, chunkKey } from '../world/coords';
import { buildPaddedVolume, greedyMesh, type VoxelSource } from '../world/mesher';
import { generateChunkDense } from '../world/terrain';
import type { Engine } from './engine';
import type { EngineStats } from './stats-overlay';

export interface ParityReport {
  chunksCompared: number;
  voxelsCompared: number;
  voxelMismatches: number;
  meshesCompared: number;
  meshMismatches: { chunk: [number, number, number]; gpu: [number, number]; cpu: [number, number] }[];
}

export interface VoxelDebugApi {
  engine: Engine;
  stats(): EngineStats;
  /** True when nothing is queued for generation or meshing and no readback is pending. */
  settled(): boolean;
  /** Compares GPU results against the CPU reference implementations. */
  parity(maxChunks?: number): ParityReport;
  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  setBlock(x: number, y: number, z: number, block: number): boolean;
  /** Height of the topmost opaque voxel of a loaded column, or null. */
  surfaceAt(x: number, z: number): number | null;
  /** PNG data URL of the last rendered frame (offscreen mode). */
  screenshot(): Promise<string>;
}

/**
 * Cross-checks GPU output against the CPU mirrors:
 *  - voxels produced by worldgen.wgsl vs `generateChunkDense` (f32 vs f64 noise may differ on
 *    a handful of boundary voxels),
 *  - quad counts produced by gather.wgsl + mesh.wgsl vs `greedyMesh` on the same voxel data
 *    (must match exactly).
 */
export function runParityCheck(engine: Engine, maxChunks = 32): ParityReport {
  const report: ParityReport = { chunksCompared: 0, voxelsCompared: 0, voxelMismatches: 0, meshesCompared: 0, meshMismatches: [] };
  const chunks = engine.chunks;
  for (const record of chunks.chunks.values()) {
    if (report.chunksCompared >= maxChunks) break;
    if (record.state !== 'ready' || !record.data) continue;
    const gpuDense = record.data.toDense();
    const cpuDense = generateChunkDense(record.cx, record.cy, record.cz, engine.options.seed);
    for (let i = 0; i < gpuDense.length; i++) if (gpuDense[i] !== cpuDense[i]) report.voxelMismatches++;
    report.voxelsCompared += gpuDense.length;
    report.chunksCompared++;

    if (record.needsMesh || record.meshVersion === 0 || record.opaqueQuads < 0) continue;
    const neighbors: (VoxelSource | null)[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = chunks.chunks.get(chunkKey(record.cx + dx, record.cy + dy, record.cz + dz));
          neighbors.push(n && n.state === 'ready' && n.data ? n.data : null);
        }
      }
    }
    const cpu = greedyMesh(buildPaddedVolume(neighbors));
    report.meshesCompared++;
    if (cpu.opaqueQuads !== record.opaqueQuads || cpu.waterQuads !== record.waterQuads) {
      report.meshMismatches.push({
        chunk: [record.cx, record.cy, record.cz],
        gpu: [record.opaqueQuads, record.waterQuads],
        cpu: [cpu.opaqueQuads, cpu.waterQuads],
      });
    }
  }
  return report;
}

export function installDebugApi(engine: Engine): VoxelDebugApi {
  const api: VoxelDebugApi = {
    engine,
    stats: () => engine.collectStats(),
    settled: () => {
      const s = engine.chunks.countByState();
      return s.pending === 0 && s.generating === 0 && engine.chunks.meshQueueSize === 0 &&
        [...engine.chunks.drawable()].every((r) => r.opaqueQuads >= 0);
    },
    parity: (maxChunks) => runParityCheck(engine, maxChunks),
    teleport: (x, y, z, yaw, pitch) => {
      engine.camera.position[0] = x;
      engine.camera.position[1] = y;
      engine.camera.position[2] = z;
      if (yaw !== undefined) engine.camera.yaw = yaw;
      if (pitch !== undefined) engine.camera.setPitch(pitch);
    },
    setBlock: (x, y, z, block) => engine.chunks.setBlock(x, y, z, block),
    surfaceAt: (x, z) => {
      const top = (engine.chunks.config.maxChunkY + 1) * CHUNK_SIZE - 1;
      const bottom = engine.chunks.config.minChunkY * CHUNK_SIZE;
      for (let y = top; y >= bottom; y--) if (isOpaque(engine.chunks.getBlock(x, y, z))) return y;
      return null;
    },
    screenshot: async () => {
      const frame = await engine.gpu.captureFrame();
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.pixels), frame.width, frame.height), 0, 0);
      return canvas.toDataURL('image/png');
    },
  };
  (globalThis as unknown as { __voxel: VoxelDebugApi }).__voxel = api;
  return api;
}
