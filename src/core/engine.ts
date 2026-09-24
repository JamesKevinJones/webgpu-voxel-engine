import { Camera } from '../camera/camera';
import { FlyController, readMoveIntent, type MoveIntent } from '../camera/fly-controller';
import { InputState } from '../camera/input';
import { Renderer, type DrawLists } from '../gpu/renderer';
import { StagingPool } from '../gpu/staging-pool';
import { VOXEL_SLOT_BYTES, WorldGpu, fitSlotsToLimits } from '../gpu/world-gpu';
import { intersectsSolid, type SolidQuery } from '../physics/aabb';
import { Player, type PlayerWorld } from '../physics/player';
import { BLOCK_NAMES, BlockType, isOpaque, isUnbreakable } from '../world/block';
import { ChunkManager, DEFAULT_STREAMING, type GenerationJob, type MeshJob } from '../world/chunk-manager';
import { CHUNK_SIZE, worldToChunk } from '../world/coords';
import {
  MESH_COUNTER_WORDS,
  OPAQUE_QUAD_CAPACITY,
  VERTICES_PER_QUAD,
  WATER_QUAD_CAPACITY,
} from '../world/mesh-format';
import { GPU_SLOT_WORDS, PalettedChunk } from '../world/palette-chunk';
import { raycastVoxels, type RaycastHit } from '../world/raycast';
import { SEA_LEVEL, surfaceHeight } from '../world/terrain';
import { FrameTimer } from './frame-timer';
import { computeSky, formatTimeOfDay, wrapTime } from './sky';
import { GpuContext } from './gpu-context';
import { StatsOverlay, type EngineStats } from './stats-overlay';
import { FrameUniforms } from './uniforms';

export interface EngineOptions {
  seed: number;
  /** Horizontal view/streaming radius in chunks. */
  radius: number;
  /** Chunks generated per frame (one GPU batch). */
  generationBatch: number;
  /** Chunks meshed per frame (one GPU batch). */
  meshBatch: number;
  /** Render to an offscreen texture instead of the canvas (headless automation). */
  offscreen: boolean;
  /** Initial time of day (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset). */
  timeOfDay: number;
  /** Real-time seconds per in-game day (0 freezes the clock). */
  dayLength: number;
}

export type MovementMode = 'freecam' | 'walk';

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  seed: 1337,
  radius: DEFAULT_STREAMING.radius,
  generationBatch: 8,
  meshBatch: 12,
  offscreen: false,
  timeOfDay: 0.32,
  dayLength: 600,
};

const PLACEABLE = [
  BlockType.Stone, BlockType.Dirt, BlockType.Grass, BlockType.Sand, BlockType.Water,
  BlockType.Basalt, BlockType.Wood, BlockType.Leaves,
];
const REACH = 8;
/** CPU may run at most this many frames ahead of the GPU (backpressure for slow or offscreen GPUs). */
const MAX_FRAMES_IN_FLIGHT = 2;

/**
 * Owns the frame loop: input → camera → streaming decisions → GPU generation / meshing passes →
 * render → asynchronous readbacks that feed the CPU-side chunk state.
 */
export class Engine {
  readonly camera = new Camera();
  readonly input = new InputState();
  readonly controller: FlyController;
  readonly player = new Player();
  mode: MovementMode = 'freecam';
  timeOfDay: number;
  timePaused = false;
  private physicsReady = false;
  private readonly playerWorld: PlayerWorld;
  readonly chunks: ChunkManager;
  readonly timer = new FrameTimer();
  private readonly genStaging: StagingPool;
  private readonly meshStaging: StagingPool;
  private raf = 0;
  private running = false;
  private framesInFlight = 0;
  private startTime = -1;
  private placeIndex = 0;
  private readonly moveIntent: MoveIntent = { forward: 0, strafe: 0, vertical: 0, boost: false };
  private target: RaycastHit | null = null;
  private visibleChunks = 0;
  private readonly draws: { opaque: number[]; water: number[] } = { opaque: [], water: [] };
  private readonly sortScratch: { slot: number; d: number }[] = [];
  private readonly waterScratch: { slot: number; d: number }[] = [];
  /** Pending asynchronous readbacks (awaited by `flush`). */
  private readonly inflight = new Set<Promise<unknown>>();
  lastError: unknown = null;

  private constructor(
    readonly gpu: GpuContext,
    readonly world: WorldGpu,
    readonly renderer: Renderer,
    readonly uniforms: FrameUniforms,
    readonly overlay: StatsOverlay | null,
    readonly options: EngineOptions,
  ) {
    this.chunks = new ChunkManager({
      radius: options.radius,
      voxelSlots: world.config.voxelSlots,
      meshSlots: world.config.meshSlots,
    });
    this.controller = new FlyController(this.camera, this.input);
    this.timeOfDay = wrapTime(options.timeOfDay);
    // Unloaded chunks count as solid so the player can never fall out of the generated world.
    const solid: SolidQuery = (x, y, z) => {
      const b = this.chunks.getBlock(x, y, z);
      return b < 0 || isOpaque(b);
    };
    this.playerWorld = { solid, water: (x, y, z) => this.chunks.getBlock(x, y, z) === BlockType.Water };
    this.genStaging = new StagingPool(gpu.device, options.generationBatch * VOXEL_SLOT_BYTES, 3, 'worldgen readback');
    this.meshStaging = new StagingPool(gpu.device, options.meshBatch * MESH_COUNTER_WORDS * 4, 4, 'mesh readback');

    const spawnY = Math.max(surfaceHeight(0, 0, options.seed), SEA_LEVEL) + 12;
    this.camera.position[0] = 0.5;
    this.camera.position[1] = spawnY;
    this.camera.position[2] = 0.5;
    this.camera.pitch = -0.25;

    const fogEnd = options.radius * CHUNK_SIZE - 8;
    this.camera.far = Math.max(600, fogEnd * 1.6);
    uniforms.setFog(fogEnd, 0.8 / fogEnd, 0.02, SEA_LEVEL);
  }

  static async create(canvas: HTMLCanvasElement, overlayRoot: HTMLElement | null, options: Partial<EngineOptions> = {}): Promise<Engine> {
    const opts = { ...DEFAULT_ENGINE_OPTIONS, ...options };
    const gpu = await GpuContext.create(canvas, { offscreen: opts.offscreen });
    // Size the pools for the streaming cylinder: every column holds (maxY - minY + 1) chunks,
    // roughly half of which are empty sky/solid rock that do not need a mesh slot.
    const columns = Math.ceil(Math.PI * (opts.radius + 2) * (opts.radius + 2));
    const layers = DEFAULT_STREAMING.maxChunkY - DEFAULT_STREAMING.minChunkY + 1;
    const slots = fitSlotsToLimits(gpu.device.limits, {
      voxelSlots: columns * layers,
      meshSlots: Math.ceil(columns * layers * 0.6),
    });
    const world = await WorldGpu.create(gpu.device, {
      ...slots,
      maxGenJobs: opts.generationBatch,
      maxMeshJobs: opts.meshBatch,
      seed: opts.seed,
    });
    const uniforms = new FrameUniforms(gpu.device);
    const renderer = await Renderer.create(gpu.device, gpu.format, world, uniforms.buffer);
    const overlay = overlayRoot ? new StatsOverlay(overlayRoot) : null;
    const engine = new Engine(gpu, world, renderer, uniforms, overlay, opts);
    engine.input.attach(canvas);
    return engine;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Waits until every submitted readback has been processed. */
  async flush(): Promise<void> {
    await this.gpu.device.queue.onSubmittedWorkDone();
    while (this.inflight.size > 0) await Promise.all([...this.inflight]);
  }

  get placeBlock(): number {
    return PLACEABLE[this.placeIndex]!;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    try {
      this.step(now);
    } catch (err) {
      this.lastError = err;
      this.stop();
      throw err;
    }
  };

  /** Runs one full frame. Public so automation can drive frames deterministically. */
  step(now: number): void {
    if (this.framesInFlight >= MAX_FRAMES_IN_FLIGHT) return;
    if (this.startTime < 0) this.startTime = now;
    const dt = this.timer.tick(now);
    if (this.gpu.resize()) this.uniforms.setViewport(this.gpu.width, this.gpu.height);
    this.camera.aspect = this.gpu.aspect;

    this.handleHotkeys();
    this.controller.look();
    if (this.mode === 'walk') this.updatePlayer(dt);
    else this.controller.move(dt);
    if (!this.timePaused && this.options.dayLength > 0) this.timeOfDay = wrapTime(this.timeOfDay + dt / this.options.dayLength);
    this.uniforms.setSky(computeSky(this.timeOfDay));
    this.camera.updateMatrices();
    this.updateTarget();
    this.handleClicks();

    const pos = this.camera.position;
    this.chunks.updateCenter(worldToChunk(pos[0]!), worldToChunk(pos[1]!), worldToChunk(pos[2]!));

    const device = this.gpu.device;
    for (const record of this.chunks.takeUploads()) this.world.uploadChunk(record.voxelSlot, record.data!);

    const encoder = device.createCommandEncoder({ label: 'frame' });

    let genJobs: GenerationJob[] = [];
    let genBuffer: GPUBuffer | null = null;
    if (this.genStaging.available > 0) {
      genJobs = this.chunks.nextGenerationBatch(this.options.generationBatch);
      if (genJobs.length > 0) genBuffer = this.genStaging.acquire();
    }
    this.world.encodeGeneration(encoder, genJobs, genBuffer);

    let meshJobs: MeshJob[] = [];
    let meshBuffer: GPUBuffer | null = null;
    if (this.meshStaging.available > 0) {
      meshJobs = this.chunks.nextMeshBatch(this.options.meshBatch);
      if (meshJobs.length > 0) meshBuffer = this.meshStaging.acquire();
    }
    this.world.encodeMeshing(encoder, meshJobs, meshBuffer);

    this.buildDrawLists();
    this.uniforms.setCamera(this.camera.viewProjection, this.camera.inverseViewProjection, pos, (now - this.startTime) / 1000,
      this.camera.near, this.camera.far);
    this.uniforms.upload();
    const colorView = this.gpu.currentColorView();
    this.renderer.render(encoder, colorView, this.gpu.depthView!, this.draws as DrawLists);

    device.queue.submit([encoder.finish()]);
    this.framesInFlight++;
    device.queue.onSubmittedWorkDone().then(
      () => { this.framesInFlight--; },
      () => { this.framesInFlight--; },
    );

    if (genBuffer) this.track(this.readGeneration(genBuffer, genJobs));
    if (meshBuffer) this.track(this.readMeshCounts(meshBuffer, meshJobs));

    this.overlay?.update(this.collectStats(), now);
  }

  private track(p: Promise<unknown>): void {
    const tracked = p.catch((err: unknown) => {
      this.lastError = err;
      console.error(err);
    }).finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }

  private readGeneration(buffer: GPUBuffer, jobs: GenerationJob[]): Promise<void> {
    return this.genStaging.read(buffer, jobs.length * VOXEL_SLOT_BYTES, (bytes) => {
      const words = new Uint32Array(bytes);
      jobs.forEach((job, i) => {
        this.chunks.completeGeneration(job, PalettedChunk.fromGpuLayout(words, i * GPU_SLOT_WORDS));
      });
    });
  }

  private readMeshCounts(buffer: GPUBuffer, jobs: MeshJob[]): Promise<void> {
    return this.meshStaging.read(buffer, jobs.length * MESH_COUNTER_WORDS * 4, (bytes) => {
      const counts = new Uint32Array(bytes);
      jobs.forEach((job, i) => {
        this.chunks.completeMesh(job, counts[i * MESH_COUNTER_WORDS]!, counts[i * MESH_COUNTER_WORDS + 1]!, counts[i * MESH_COUNTER_WORDS + 2]!);
      });
    });
  }

  private buildDrawLists(): void {
    const opaque = this.sortScratch;
    const water = this.waterScratch;
    opaque.length = 0;
    water.length = 0;
    const frustum = this.camera.frustum;
    const p = this.camera.position;
    let visible = 0;
    for (const r of this.chunks.drawable()) {
      const x0 = r.cx * CHUNK_SIZE, y0 = r.cy * CHUNK_SIZE, z0 = r.cz * CHUNK_SIZE;
      if (!frustum.intersectsAabb(x0, y0, z0, x0 + CHUNK_SIZE, y0 + CHUNK_SIZE, z0 + CHUNK_SIZE)) continue;
      visible++;
      const h = CHUNK_SIZE / 2;
      const dx = x0 + h - p[0]!, dy = y0 + h - p[1]!, dz = z0 + h - p[2]!;
      const d = dx * dx + dy * dy + dz * dz;
      if (r.opaqueQuads !== 0) opaque.push({ slot: r.meshSlot, d });
      if (r.waterQuads !== 0) water.push({ slot: r.meshSlot, d });
    }
    opaque.sort((a, b) => a.d - b.d);
    water.sort((a, b) => b.d - a.d);
    this.draws.opaque.length = 0;
    this.draws.water.length = 0;
    for (const o of opaque) this.draws.opaque.push(o.slot);
    for (const w of water) this.draws.water.push(w.slot);
    this.visibleChunks = visible;
  }

  private updateTarget(): void {
    const p = this.camera.position, f = this.camera.forward;
    this.target = raycastVoxels(p[0]!, p[1]!, p[2]!, f[0]!, f[1]!, f[2]!, REACH,
      (x, y, z) => this.chunks.getBlock(x, y, z), isOpaque);
  }

  private handleHotkeys(): void {
    for (let i = 0; i < PLACEABLE.length; i++) {
      if (this.input.isDown(`Digit${i + 1}`)) this.placeIndex = i;
    }
    for (const code of this.input.consumePresses()) {
      if (code === 'KeyV') this.setMode(this.mode === 'walk' ? 'freecam' : 'walk');
      else if (code === 'KeyT') this.timePaused = !this.timePaused;
      else if (code === 'BracketRight') this.timeOfDay = wrapTime(this.timeOfDay + 1 / 24);
      else if (code === 'BracketLeft') this.timeOfDay = wrapTime(this.timeOfDay - 1 / 24);
    }
  }

  /** Switches between free-fly spectator and walking (physics) mode, keeping the eye position. */
  setMode(mode: MovementMode): void {
    if (mode === this.mode) return;
    const p = this.camera.position;
    if (mode === 'walk') {
      this.player.setFromEye(p[0]!, p[1]!, p[2]!);
      this.player.resolveEmbedded(this.playerWorld.solid);
    } else {
      this.controller.velocity.set(this.player.velocity);
    }
    this.mode = mode;
  }

  private updatePlayer(dt: number): void {
    const p = this.player.position;
    const x = Math.floor(p[0]!), y = Math.floor(p[1]!), z = Math.floor(p[2]!);
    // Freeze the simulation until the terrain around the player has been generated.
    this.physicsReady = this.chunks.getBlock(x, y, z) >= 0 && this.chunks.getBlock(x, y - 1, z) >= 0;
    if (this.physicsReady) {
      const intent = readMoveIntent(this.input, this.moveIntent);
      this.player.update(dt, {
        forward: intent.forward,
        strafe: intent.strafe,
        jump: this.input.isDown('Space'),
        sprint: intent.boost,
      }, this.camera.yaw, this.playerWorld);
    }
    this.player.eye(this.camera.position);
  }

  private handleClicks(): void {
    for (const button of this.input.consumeClicks()) {
      const hit = this.target;
      if (!hit) continue;
      if (button === 0) {
        if (!isUnbreakable(hit.block)) this.chunks.setBlock(hit.x, hit.y, hit.z, BlockType.Air);
      } else if (button === 2) {
        const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
        const existing = this.chunks.getBlock(x, y, z);
        // Never place a solid block inside the walking player.
        const blocksPlayer = this.mode === 'walk' && isOpaque(this.placeBlock) &&
          intersectsSolid(this.player.bounds(), (bx, by, bz) => bx === x && by === y && bz === z);
        if ((existing === BlockType.Air || existing === BlockType.Water) && !blocksPlayer) {
          this.chunks.setBlock(x, y, z, this.placeBlock);
        }
      }
      this.updateTarget();
    }
  }

  collectStats(): EngineStats {
    const states = this.chunks.countByState();
    let meshed = 0, vertices = 0, overflow = 0, cpuBytes = 0;
    for (const r of this.chunks.drawable()) {
      meshed++;
      const oq = Math.max(0, r.opaqueQuads), wq = Math.max(0, r.waterQuads);
      if (oq > OPAQUE_QUAD_CAPACITY || wq > WATER_QUAD_CAPACITY) overflow++;
      vertices += (Math.min(oq, OPAQUE_QUAD_CAPACITY) + Math.min(wq, WATER_QUAD_CAPACITY)) * VERTICES_PER_QUAD;
    }
    for (const r of this.chunks.chunks.values()) if (r.data) cpuBytes += r.data.dataByteLength + 64;
    const p = this.camera.position, v = this.mode === 'walk' ? this.player.velocity : this.controller.velocity;
    const t = this.target;
    return {
      fps: this.timer.fps,
      frameMs: this.timer.frameMs,
      chunksLoaded: states.ready,
      chunksPending: states.pending,
      chunksGenerating: states.generating,
      meshQueue: this.chunks.meshQueueSize,
      meshedChunks: meshed,
      visibleChunks: this.visibleChunks,
      vertices,
      triangles: vertices / 2,
      overflowChunks: overflow,
      voxelSlotsUsed: this.chunks.voxelSlots.used,
      voxelSlotsTotal: this.chunks.voxelSlots.capacity,
      meshSlotsUsed: this.chunks.meshSlots.used,
      meshSlotsTotal: this.chunks.meshSlots.capacity,
      gpuMemoryMB: this.world.allocatedBytes / (1024 * 1024),
      cpuVoxelKB: cpuBytes / 1024,
      camera: { x: p[0]!, y: p[1]!, z: p[2]!, yaw: this.camera.yaw, pitch: this.camera.pitch },
      chunk: { x: worldToChunk(p[0]!), y: worldToChunk(p[1]!), z: worldToChunk(p[2]!) },
      speed: Math.hypot(v[0]!, v[1]!, v[2]!),
      mode: this.mode === 'walk' ? 'Walking (V)' : 'Freecam (V)',
      grounded: this.mode !== 'walk' ? '—' : !this.physicsReady ? 'waiting for terrain'
        : this.player.inWater ? 'swimming' : this.player.grounded ? 'grounded' : 'airborne',
      timeOfDay: `${formatTimeOfDay(this.timeOfDay)}${this.timePaused ? ' (paused)' : ''}`,
      target: t ? `${BLOCK_NAMES[t.block]} @ ${t.x}, ${t.y}, ${t.z}` : '—',
      placeBlock: `${this.placeIndex + 1}: ${BLOCK_NAMES[this.placeBlock]}`,
      seed: this.options.seed,
    };
  }

  destroy(): void {
    this.stop();
    this.input.detach();
    this.genStaging.destroy();
    this.meshStaging.destroy();
    this.world.destroy();
  }
}
