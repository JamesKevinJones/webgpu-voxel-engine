import { intersectsSolid } from '../physics/aabb';
import { isOpaque } from '../world/block';
import { CHUNK_SIZE, chunkKey, worldToChunk } from '../world/coords';
import { buildPaddedVolume, greedyMesh, type VoxelSource } from '../world/mesher';
import { climateAt, generateChunkDense, surfaceHeight } from '../world/terrain';
import type { Engine } from './engine';
import type { EngineStats } from './stats-overlay';

export interface ParityReport {
  chunksCompared: number;
  voxelsCompared: number;
  voxelMismatches: number;
  meshesCompared: number;
  meshMismatches: { chunk: [number, number, number]; gpu: [number, number, number]; cpu: [number, number, number] }[];
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
  /** Switches between 'freecam' and 'walk' (physics) mode. */
  setMode(mode: 'freecam' | 'walk'): void;
  /** Sets the time of day (0..1) and optionally pauses the clock. */
  setTime(t: number, paused?: boolean): void;
  player(): { x: number; y: number; z: number; grounded: boolean; inWater: boolean; embedded: boolean };
  /** Nearest land column (spiral search) whose dominant biome is `biome`, or null. */
  findBiome(biome: number): [number, number] | null;
  /** Breaks a block (with debris particles) as if mined. */
  breakBlock(x: number, y: number, z: number): boolean;
  /** Number of live debris particles (CPU mirror of the GPU simulation). */
  particlesAlive(): number;
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
    // Only chunks whose 26 neighbours are all loaded: chunks at the streaming frontier keep meshes
    // built while now-unloaded neighbours existed (their culled faces face away from the viewer),
    // so the CPU mesher, which sees air there, would legitimately disagree.
    const neighbors: (VoxelSource | null)[] = [];
    let complete = true;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cy = record.cy + dy;
          const n = chunks.chunks.get(chunkKey(record.cx + dx, cy, record.cz + dz));
          const inWorld = cy >= chunks.config.minChunkY && cy <= chunks.config.maxChunkY;
          if (inWorld && (!n || n.state !== 'ready')) complete = false;
          neighbors.push(n && n.state === 'ready' && n.data ? n.data : null);
        }
      }
    }
    if (!complete) continue;
    const cpu = greedyMesh(buildPaddedVolume(neighbors));
    report.meshesCompared++;
    if (cpu.opaqueQuads !== record.opaqueQuads || cpu.waterQuads !== record.waterQuads || cpu.cutoutQuads !== record.cutoutQuads) {
      report.meshMismatches.push({
        chunk: [record.cx, record.cy, record.cz],
        gpu: [record.opaqueQuads, record.waterQuads, record.cutoutQuads],
        cpu: [cpu.opaqueQuads, cpu.waterQuads, cpu.cutoutQuads],
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
      // Streaming must already be centred on the camera (a teleport takes effect on the next frame).
      const c = engine.chunks.center, p = engine.camera.position;
      if (c.x !== worldToChunk(p[0]!) || c.z !== worldToChunk(p[2]!)) return false;
      const s = engine.chunks.countByState();
      return s.pending === 0 && s.generating === 0 && engine.chunks.meshQueueSize === 0 &&
        [...engine.chunks.drawable()].every((r) => r.opaqueQuads >= 0);
    },
    parity: (maxChunks) => runParityCheck(engine, maxChunks),
    teleport: (x, y, z, yaw, pitch) => {
      engine.camera.position[0] = x;
      engine.camera.position[1] = y;
      engine.camera.position[2] = z;
      engine.controller.velocity.fill(0);
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
    setMode: (mode) => engine.setMode(mode),
    breakBlock: (x, y, z) => engine.breakBlock(x, y, z),
    findBiome: (biome) => {
      const seed = engine.options.seed;
      for (let r = 0; r < 4000; r += 48) {
        const steps = Math.max(1, Math.floor((2 * Math.PI * r) / 48));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
          if (climateAt(x, z, seed).biome === biome && surfaceHeight(x, z, seed) > 6) return [x, z];
        }
      }
      return null;
    },
    particlesAlive: () => engine.particles.alive(),
    setTime: (t, paused = true) => {
      engine.timeOfDay = t - Math.floor(t);
      engine.timePaused = paused;
    },
    player: () => {
      const p = engine.player;
      const solid = (x: number, y: number, z: number) => isOpaque(engine.chunks.getBlock(x, y, z));
      return {
        x: p.position[0]!, y: p.position[1]!, z: p.position[2]!,
        grounded: p.grounded, inWater: p.inWater, embedded: intersectsSolid(p.bounds({ minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }), solid),
      };
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
