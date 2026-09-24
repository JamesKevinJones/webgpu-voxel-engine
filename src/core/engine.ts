import { materialOf, type SoundSink } from '../audio/sound';
import { Camera } from '../camera/camera';
import { FlyController, readMoveIntent, type MoveIntent } from '../camera/fly-controller';
import { InputState } from '../camera/input';
import { MiningState } from '../fx/mining';
import { ParticleRing } from '../fx/particles';
import { Renderer, SHADOW_CASCADES, SHADOW_MAP_SIZE, type DrawLists } from '../gpu/renderer';
import { StagingPool } from '../gpu/staging-pool';
import { VOXEL_SLOT_BYTES, WorldGpu, fitSlotsToLimits } from '../gpu/world-gpu';
import { intersectsSolid, type SolidQuery } from '../physics/aabb';
import { Player, type PlayerWorld } from '../physics/player';
import { WorldDelta } from '../storage/delta';
import type { PlayerSave } from '../storage/world-store';
import { BLOCK_NAMES, BlockType, isPlaceReplaceable, isSolid, isTargetable, isWater } from '../world/block';
import { ChunkManager, DEFAULT_STREAMING, type GenerationJob, type MeshJob } from '../world/chunk-manager';
import { CHUNK_SIZE, worldToChunk } from '../world/coords';
import { FluidSim } from '../world/fluids';
import { blockLight, skyLight } from '../world/lighting';
import {
  MESH_COUNTER_WORDS,
  OPAQUE_QUAD_CAPACITY,
  VERTICES_PER_QUAD,
  WATER_QUAD_CAPACITY,
  CUTOUT_QUAD_CAPACITY,
} from '../world/mesh-format';
import { GPU_SLOT_WORDS, PalettedChunk } from '../world/palette-chunk';
import { raycastVoxels, type RaycastHit } from '../world/raycast';
import { SEA_LEVEL, climateAt, surfaceHeight, BIOME_NAMES } from '../world/terrain';
import { computeCascades } from './cascades';
import { HotbarModel, itemName } from './hotbar';
import { FrameTimer } from './frame-timer';
import { computeSky, formatTimeOfDay, wrapTime } from './sky';
import type { GpuContext } from './gpu-context';
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
  /** Initial time of day (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset). */
  timeOfDay: number;
  /** Real-time seconds per in-game day (0 freezes the clock). */
  dayLength: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Fog density multiplier (1 = default). */
  fogDensity: number;
  shadows: boolean;
}

export type MovementMode = 'freecam' | 'walk';

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  seed: 1337,
  radius: DEFAULT_STREAMING.radius,
  generationBatch: 8,
  meshBatch: 12,
  timeOfDay: 0.32,
  dayLength: 600,
  fov: 70,
  fogDensity: 1,
  shadows: true,
};

/** Saved state a new engine starts from. */
export interface EngineWorldState {
  delta: WorldDelta;
  player: PlayerSave | null;
}

const REACH = 8;
/** Shadows are rendered up to this view depth (clamped to the fog distance). */
const SHADOW_DISTANCE = 160;
const SHADOW_SPLIT_LAMBDA = 0.75;
/** Extra depth towards the light so off-screen occluders (mountains, trees) still cast shadows. */
const SHADOW_CASTER_MARGIN = 120;
/** CPU may run at most this many frames ahead of the GPU (backpressure for slow or offscreen GPUs). */
const MAX_FRAMES_IN_FLIGHT = 2;
/** CPU time per frame spent on the initial lighting of streamed chunks. */
const LIGHT_BUDGET_MS = 6;
/** Distance walked between footsteps (m). */
const STRIDE = 2.1;
const SWIM_STROKE = 1.6;

/**
 * Owns the frame loop: input → camera → streaming decisions → lighting / fluid updates → GPU
 * generation / meshing passes → render → asynchronous readbacks that feed the CPU-side chunk state.
 */
export class Engine {
  readonly camera = new Camera();
  readonly input = new InputState();
  readonly controller: FlyController;
  readonly player = new Player();
  mode: MovementMode = 'freecam';
  timeOfDay: number;
  timePaused = false;
  /** Pause menu open: the world keeps rendering and streaming, but nothing moves. */
  paused = false;
  /** Title screen: the camera slowly pans over the world. */
  attract = false;
  private physicsReady = false;
  private readonly playerWorld: PlayerWorld;
  readonly chunks: ChunkManager;
  readonly fluids: FluidSim;
  readonly delta: WorldDelta;
  readonly timer = new FrameTimer();
  private readonly genStaging: StagingPool;
  private readonly meshStaging: StagingPool;
  private raf = 0;
  private running = false;
  private framesInFlight = 0;
  /** Frames whose GPU work has completed (automation waits on this for fresh captures). */
  completedFrames = 0;
  private startTime = -1;
  readonly hotbar = new HotbarModel();
  readonly mining = new MiningState();
  readonly particles = new ParticleRing();
  sound: SoundSink | null = null;
  private crackStage = -1;
  /** Blocks broken so far and the size of the most recent debris burst. */
  blocksBroken = 0;
  blocksPlaced = 0;
  lastBurstSize = 0;
  shadowsEnabled: boolean;
  private fogEnd = 0;
  private fogDensityScale = 1;
  private stepDistance = 0;
  private swimDistance = 0;
  private wasInWater = false;
  private wasGrounded = true;
  private fallSpeed = 0;
  private readonly moveIntent: MoveIntent = { forward: 0, strafe: 0, vertical: 0, boost: false };
  private target: RaycastHit | null = null;
  private visibleChunks = 0;
  private readonly draws: { opaque: number[]; cutout: number[]; water: number[]; shadow: number[][] } = {
    opaque: [], cutout: [], water: [], shadow: Array.from({ length: SHADOW_CASCADES }, () => []),
  };
  private cascadeSpheres: { center: [number, number, number]; radius: number }[] = [];
  private readonly sortScratch: { slot: number; d: number }[] = [];
  private readonly waterScratch: { slot: number; d: number }[] = [];
  /** Pending asynchronous readbacks (awaited by `flush`). */
  private readonly inflight = new Set<Promise<unknown>>();
  lastError: unknown = null;
  private destroyed = false;

  private constructor(
    readonly gpu: GpuContext,
    readonly world: WorldGpu,
    readonly renderer: Renderer,
    readonly uniforms: FrameUniforms,
    readonly overlay: StatsOverlay | null,
    readonly options: EngineOptions,
    state: EngineWorldState | null,
  ) {
    this.chunks = new ChunkManager({
      radius: options.radius,
      voxelSlots: world.config.voxelSlots,
      meshSlots: world.config.meshSlots,
    });
    this.delta = state?.delta ?? new WorldDelta();
    this.chunks.edits = this.delta;
    this.fluids = new FluidSim({
      getBlock: (x, y, z) => this.chunks.getBlock(x, y, z),
      setBlock: (x, y, z, block) => this.writeBlock(x, y, z, block),
    });
    this.controller = new FlyController(this.camera, this.input);
    this.timeOfDay = wrapTime(options.timeOfDay);
    this.shadowsEnabled = options.shadows;
    // Unloaded chunks count as solid so the player can never fall out of the generated world.
    const solid: SolidQuery = (x, y, z) => {
      const b = this.chunks.getBlock(x, y, z);
      return b < 0 || isSolid(b);
    };
    this.playerWorld = { solid, water: (x, y, z) => isWater(this.chunks.getBlock(x, y, z)) };
    this.genStaging = new StagingPool(gpu.device, options.generationBatch * VOXEL_SLOT_BYTES, 3, 'worldgen readback');
    this.meshStaging = new StagingPool(gpu.device, options.meshBatch * MESH_COUNTER_WORDS * 4, 4, 'mesh readback');

    const spawnY = Math.max(surfaceHeight(0, 0, options.seed), SEA_LEVEL) + 12;
    this.camera.position[0] = 0.5;
    this.camera.position[1] = spawnY;
    this.camera.position[2] = 0.5;
    this.camera.pitch = -0.25;
    this.setFov(options.fov);

    this.fogEnd = options.radius * CHUNK_SIZE - 8;
    this.camera.far = Math.max(600, this.fogEnd * 1.6);
    this.setFogDensity(options.fogDensity);
    uniforms.setSeed(options.seed);
    if (state?.player) this.restore(state.player);
  }

  /** Creates an engine on an existing GPU context (the context outlives engines, e.g. across render-distance changes). */
  static async create(gpu: GpuContext, overlayRoot: HTMLElement | null, options: Partial<EngineOptions> = {},
    state: EngineWorldState | null = null): Promise<Engine> {
    const opts = { ...DEFAULT_ENGINE_OPTIONS, ...options };
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
    const engine = new Engine(gpu, world, renderer, uniforms, overlay, opts, state);
    engine.input.attach(gpu.canvas);
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
    return this.hotbar.block;
  }

  // ------------------------------------------------------------------ settings

  setFov(degrees: number): void {
    this.options.fov = Math.min(110, Math.max(30, degrees));
    this.camera.fovY = (this.options.fov * Math.PI) / 180;
  }

  /** Scales the distance fog (1 = default); the fog always closes at the streaming edge. */
  setFogDensity(scale: number): void {
    this.fogDensityScale = Math.min(4, Math.max(0, scale));
    this.options.fogDensity = this.fogDensityScale;
    this.uniforms.setFog(this.fogEnd, (0.8 / this.fogEnd) * this.fogDensityScale, 0.02, SEA_LEVEL);
  }

  // ------------------------------------------------------------------ frame

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

    const active = !this.paused && !this.attract;
    if (active) {
      this.handleHotkeys();
      this.controller.look();
      if (this.mode === 'walk') {
        this.hotbar.scroll(Math.sign(this.input.consumeWheel()));
        this.updatePlayer(dt);
      } else {
        this.controller.move(dt);
      }
    } else {
      // Drop input gathered while a menu is open.
      this.input.consumePresses();
      this.input.consumeClicks();
      this.input.consumeWheel();
      this.input.consumeMouse([0, 0]);
      if (this.attract) this.camera.yaw += dt * 0.04;
    }
    if (!this.paused && !this.timePaused && this.options.dayLength > 0) this.timeOfDay = wrapTime(this.timeOfDay + dt / this.options.dayLength);
    const sky = computeSky(this.timeOfDay);
    this.uniforms.setSky(sky);
    this.camera.updateMatrices();
    this.updateTarget();
    if (active) {
      this.handleClicks();
      this.updateMining(dt);
      this.fluids.update(dt);
    } else {
      this.crackStage = -1;
    }
    this.updateShadows(sky.lightDir, sky.lightIntensity);

    const pos = this.camera.position;
    this.chunks.updateCenter(worldToChunk(pos[0]!), worldToChunk(pos[1]!), worldToChunk(pos[2]!));
    this.chunks.processLighting(LIGHT_BUDGET_MS);

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
    this.uniforms.setCamera(this.camera.viewProjection, this.camera.inverseViewProjection, pos, this.camera.forward,
      (now - this.startTime) / 1000, this.camera.near, this.camera.far);
    this.uniforms.upload();
    this.renderer.simulateParticles(encoder, this.paused ? 0 : dt);
    const colorView = this.gpu.currentColorView();
    const t = this.target;
    this.renderer.render(encoder, colorView, this.gpu.depthView!, this.draws as DrawLists, {
      target: t && active ? [t.x, t.y, t.z] : null,
      crackStage: this.crackStage,
    });

    device.queue.submit([encoder.finish()]);
    this.framesInFlight++;
    device.queue.onSubmittedWorkDone().then(
      () => { this.framesInFlight--; this.completedFrames++; },
      () => { this.framesInFlight--; },
    );

    if (genBuffer) this.track(this.readGeneration(genBuffer, genJobs));
    if (meshBuffer) this.track(this.readMeshCounts(meshBuffer, meshJobs));

    this.overlay?.update(this.collectStats(), now);
  }

  private track(p: Promise<unknown>): void {
    const tracked = p.catch((err: unknown) => {
      if (this.destroyed) return; // readbacks aborted by teardown are expected
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
    this.draws.cutout.length = 0;
    for (const list of this.draws.shadow) list.length = 0;
    const frustum = this.camera.frustum;
    const p = this.camera.position;
    const h = CHUNK_SIZE / 2;
    const chunkRadius = h * Math.sqrt(3);
    let visible = 0;
    for (const r of this.chunks.drawable()) {
      const x0 = r.cx * CHUNK_SIZE, y0 = r.cy * CHUNK_SIZE, z0 = r.cz * CHUNK_SIZE;
      // Shadow casters: any chunk whose bounding sphere touches a cascade's light volume.
      if (r.opaqueQuads !== 0) {
        this.cascadeSpheres.forEach((c, i) => {
          const d = Math.hypot(x0 + h - c.center[0], y0 + h - c.center[1], z0 + h - c.center[2]);
          if (d <= c.radius + chunkRadius) this.draws.shadow[i]!.push(r.meshSlot);
        });
      }
      if (!frustum.intersectsAabb(x0, y0, z0, x0 + CHUNK_SIZE, y0 + CHUNK_SIZE, z0 + CHUNK_SIZE)) continue;
      visible++;
      const dx = x0 + h - p[0]!, dy = y0 + h - p[1]!, dz = z0 + h - p[2]!;
      const d = dx * dx + dy * dy + dz * dz;
      if (r.opaqueQuads !== 0) opaque.push({ slot: r.meshSlot, d });
      if (r.waterQuads !== 0) water.push({ slot: r.meshSlot, d });
      if (r.cutoutQuads !== 0) this.draws.cutout.push(r.meshSlot);
    }
    opaque.sort((a, b) => a.d - b.d);
    water.sort((a, b) => b.d - a.d);
    this.draws.opaque.length = 0;
    this.draws.water.length = 0;
    for (const o of opaque) this.draws.opaque.push(o.slot);
    for (const w of water) this.draws.water.push(w.slot);
    this.visibleChunks = visible;
  }

  /** Fits the shadow cascades to the camera for the current key light. */
  private updateShadows(lightDir: readonly number[], intensity: number): void {
    const cam = this.camera;
    if (!this.shadowsEnabled || intensity <= 0.01 || lightDir[1]! < 0.03) {
      this.cascadeSpheres = [];
      this.uniforms.setShadows(null);
      return;
    }
    const f = cam.forward, r = cam.right;
    const up = [r[1]! * f[2]! - r[2]! * f[1]!, r[2]! * f[0]! - r[0]! * f[2]!, r[0]! * f[1]! - r[1]! * f[0]!];
    const distance = Math.min(SHADOW_DISTANCE, this.options.radius * CHUNK_SIZE);
    const cascades = computeCascades(
      { position: cam.position, forward: f, right: r, up, fovY: cam.fovY, aspect: cam.aspect },
      lightDir, cam.near, distance, SHADOW_CASCADES, SHADOW_SPLIT_LAMBDA, SHADOW_MAP_SIZE, SHADOW_CASTER_MARGIN,
    );
    // Casters may sit anywhere along the light direction within the margin.
    this.cascadeSpheres = cascades.map((c) => ({ center: c.center, radius: c.radius + SHADOW_CASTER_MARGIN }));
    this.uniforms.setShadows({
      viewProj: [cascades[0]!.viewProj, cascades[1]!.viewProj],
      splitFar: [cascades[0]!.far, cascades[1]!.far],
      texelSize: [cascades[0]!.texelSize, cascades[1]!.texelSize],
      resolution: SHADOW_MAP_SIZE,
      blend: 0.15,
    });
  }

  // ------------------------------------------------------------------ world edits

  /** Low-level voxel write shared by every edit: chunk data, lighting, remeshing and the save diff. */
  private writeBlock(x: number, y: number, z: number, block: number): boolean {
    if (!this.chunks.setBlock(x, y, z, block)) return false;
    this.delta.record(x, y, z, block);
    return true;
  }

  /** A player (or automation) edit: also wakes the water simulation around the voxel. */
  editBlock(x: number, y: number, z: number, block: number): boolean {
    if (!this.writeBlock(x, y, z, block)) return false;
    this.fluids.scheduleAround(x, y, z);
    return true;
  }

  /** Hold-to-mine: advances crack stages and breaks the block (with a debris burst) when done. */
  private updateMining(dt: number): void {
    const t = this.target;
    const result = this.mining.update(dt, this.input.isButtonDown(0), t ? { x: t.x, y: t.y, z: t.z, block: t.block } : null);
    this.crackStage = result.stage;
    if (result.broken) this.breakBlock(result.broken.x, result.broken.y, result.broken.z);
  }

  /** Removes a block, collects its drop and emits 16–24 debris fragments that bounce on the floor below it. */
  breakBlock(x: number, y: number, z: number): boolean {
    const block = this.chunks.getBlock(x, y, z);
    if (block <= 0 || isWater(block) || !this.editBlock(x, y, z, BlockType.Air)) return false;
    let floorY = y - 8;
    for (let fy = y - 1; fy >= y - 8; fy--) {
      const b = this.chunks.getBlock(x, fy, z);
      if (b < 0 || isSolid(b)) {
        floorY = fy + 1;
        break;
      }
    }
    const ranges = this.particles.spawnBurst(block, x, y, z, floorY);
    this.renderer.uploadParticles(this.particles.data, ranges);
    this.blocksBroken++;
    this.lastBurstSize = ranges.reduce((n, r) => n + r.count, 0);
    this.hotbar.collect(block);
    this.sound?.breakBlock(materialOf(block));
    this.updateTarget();
    return true;
  }

  /** Places the selected hotbar item into a cell; consumes one item. */
  placeAt(x: number, y: number, z: number): boolean {
    const existing = this.chunks.getBlock(x, y, z);
    const block = this.placeBlock;
    if (existing < 0 || !isPlaceReplaceable(existing) || existing === block || this.hotbar.count <= 0) return false;
    // Never place a solid block inside the walking player.
    const blocksPlayer = this.mode === 'walk' && isSolid(block) &&
      intersectsSolid(this.player.bounds(), (bx, by, bz) => bx === x && by === y && bz === z);
    if (blocksPlayer || !this.editBlock(x, y, z, block)) return false;
    this.hotbar.consume();
    this.blocksPlaced++;
    this.sound?.placeBlock(materialOf(block));
    return true;
  }

  private updateTarget(): void {
    const p = this.camera.position, f = this.camera.forward;
    this.target = raycastVoxels(p[0]!, p[1]!, p[2]!, f[0]!, f[1]!, f[2]!, REACH,
      (x, y, z) => this.chunks.getBlock(x, y, z), isTargetable);
  }

  private handleHotkeys(): void {
    for (const code of this.input.consumePresses()) {
      const slot = HotbarModel.slotForKey(code);
      if (slot >= 0) this.hotbar.select(slot);
      else if (code === 'KeyV') this.setMode(this.mode === 'walk' ? 'freecam' : 'walk');
      else if (code === 'KeyT') this.timePaused = !this.timePaused;
      else if (code === 'KeyG') this.shadowsEnabled = !this.shadowsEnabled;
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
      const before = [p[0]!, p[2]!];
      const intent = readMoveIntent(this.input, this.moveIntent);
      this.player.update(dt, {
        forward: intent.forward,
        strafe: intent.strafe,
        jump: this.input.isDown('Space'),
        sprint: intent.boost,
      }, this.camera.yaw, this.playerWorld);
      this.updateFootsteps(Math.hypot(p[0]! - before[0]!, p[2]! - before[1]!));
    }
    this.player.eye(this.camera.position);
  }

  /** Footsteps by ground material, landing thuds and water splashes. */
  private updateFootsteps(moved: number): void {
    const pl = this.player, p = pl.position;
    const vy = pl.velocity[1]!;
    if (pl.inWater && !this.wasInWater) {
      this.sound?.splash(Math.min(1, 0.25 + Math.max(0, -this.fallSpeed) / 14));
      this.swimDistance = 0;
    }
    if (pl.inWater) {
      this.swimDistance += moved;
      if (this.swimDistance > SWIM_STROKE) {
        this.swimDistance = 0;
        this.sound?.splash(0.2);
      }
    } else if (pl.grounded) {
      const ground = this.chunks.getBlock(Math.floor(p[0]!), Math.floor(p[1]! - 0.05), Math.floor(p[2]!));
      if (!this.wasGrounded && this.fallSpeed < -7 && ground > 0) {
        this.sound?.footstep(materialOf(ground), Math.min(1.5, -this.fallSpeed / 12));
      }
      this.stepDistance += moved;
      if (this.stepDistance > STRIDE && ground > 0) {
        this.stepDistance = 0;
        this.sound?.footstep(materialOf(ground), 0.8);
      }
    }
    this.wasInWater = pl.inWater;
    this.wasGrounded = pl.grounded;
    this.fallSpeed = vy;
  }

  /** Right click places the selected hotbar block against the targeted face (left click mines, see updateMining). */
  private handleClicks(): void {
    for (const button of this.input.consumeClicks()) {
      const hit = this.target;
      if (!hit || button !== 2) continue;
      this.placeAt(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz);
      this.updateTarget();
    }
  }

  // ------------------------------------------------------------------ save state

  snapshot(): PlayerSave {
    const p = this.camera.position;
    return {
      position: [p[0]!, p[1]!, p[2]!],
      yaw: this.camera.yaw,
      pitch: this.camera.pitch,
      mode: this.mode,
      timeOfDay: this.timeOfDay,
      hotbar: this.hotbar.save(),
    };
  }

  restore(save: PlayerSave): void {
    this.camera.position.set(save.position);
    this.camera.yaw = save.yaw;
    this.camera.setPitch(save.pitch);
    this.timeOfDay = wrapTime(save.timeOfDay);
    this.hotbar.load(save.hotbar);
    if (save.mode === 'walk') {
      this.mode = 'walk';
      this.player.setFromEye(save.position[0], save.position[1], save.position[2]);
    }
  }

  // ------------------------------------------------------------------ stats

  collectStats(): EngineStats {
    const states = this.chunks.countByState();
    let meshed = 0, vertices = 0, overflow = 0, cpuBytes = 0;
    for (const r of this.chunks.drawable()) {
      meshed++;
      const oq = Math.max(0, r.opaqueQuads), wq = Math.max(0, r.waterQuads), cq = Math.max(0, r.cutoutQuads);
      if (oq > OPAQUE_QUAD_CAPACITY || wq > WATER_QUAD_CAPACITY || cq > CUTOUT_QUAD_CAPACITY) overflow++;
      vertices += (Math.min(oq, OPAQUE_QUAD_CAPACITY) + Math.min(wq, WATER_QUAD_CAPACITY) + Math.min(cq, CUTOUT_QUAD_CAPACITY)) * VERTICES_PER_QUAD;
    }
    for (const r of this.chunks.chunks.values()) if (r.data) cpuBytes += r.data.dataByteLength + r.light.byteLength + 64;
    const p = this.camera.position, v = this.mode === 'walk' ? this.player.velocity : this.controller.velocity;
    const t = this.target;
    const light = this.chunks.getLight(Math.floor(p[0]!), Math.floor(p[1]!), Math.floor(p[2]!));
    return {
      fps: this.timer.fps,
      frameMs: this.timer.frameMs,
      chunksLoaded: states.ready,
      chunksPending: states.pending,
      chunksGenerating: states.generating,
      meshQueue: this.chunks.meshQueueSize,
      lightQueue: this.chunks.lightQueueSize,
      fluidCells: this.fluids.queued,
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
      placeBlock: `${this.hotbar.selected + 1}: ${itemName(this.placeBlock)} × ${this.hotbar.count}`,
      biome: BIOME_NAMES[climateAt(Math.floor(p[0]!), Math.floor(p[2]!), this.options.seed).biome],
      light: `sky ${skyLight(light)} · block ${blockLight(light)}`,
      mining: this.crackStage >= 0 ? `${Math.round(this.mining.progress * 100)} % (stage ${this.crackStage})` : '—',
      particles: this.particles.alive(),
      shadows: this.cascadeSpheres.length > 0 ? `${SHADOW_CASCADES} cascades` : 'off',
      edits: this.delta.editCount,
      seed: this.options.seed,
    };
  }

  /** Stops the frame loop, lets in-flight GPU work and readbacks finish, then releases everything. */
  async shutdown(): Promise<void> {
    this.stop();
    try {
      await this.flush();
    } catch {
      // The device may be lost; destroy anyway.
    }
    this.destroy();
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    this.input.detach();
    this.genStaging.destroy();
    this.meshStaging.destroy();
    this.renderer.destroy();
    this.uniforms.buffer.destroy();
    this.world.destroy();
  }
}
