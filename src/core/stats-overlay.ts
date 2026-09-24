export interface EngineStats {
  fps: number;
  frameMs: number;
  chunksLoaded: number;
  chunksPending: number;
  chunksGenerating: number;
  meshQueue: number;
  /** Generated chunks waiting for their initial lighting. */
  lightQueue: number;
  /** Cells scheduled in the water simulation. */
  fluidCells: number;
  meshedChunks: number;
  visibleChunks: number;
  vertices: number;
  triangles: number;
  overflowChunks: number;
  voxelSlotsUsed: number;
  voxelSlotsTotal: number;
  meshSlotsUsed: number;
  meshSlotsTotal: number;
  gpuMemoryMB: number;
  cpuVoxelKB: number;
  camera: { x: number; y: number; z: number; yaw: number; pitch: number };
  chunk: { x: number; y: number; z: number };
  speed: number;
  mode: string;
  grounded: string;
  timeOfDay: string;
  target: string;
  placeBlock: string;
  biome: string;
  /** Voxel light at the camera. */
  light: string;
  mining: string;
  particles: number;
  shadows: string;
  /** Saved voxel edits. */
  edits: number;
  seed: number;
}

const fmt = new Intl.NumberFormat('en-US');

/**
 * F3 debug overlay (lightweight DOM, refreshed a few times per second to keep layout work
 * negligible). Hidden by default; `visible` toggles it.
 */
export class StatsOverlay {
  private readonly rows = new Map<string, HTMLElement>();
  private lastUpdate = -Infinity;
  private shown = false;

  constructor(private readonly root: HTMLElement, private readonly intervalMs = 200) {
    root.replaceChildren();
    root.classList.add('stats');
    root.hidden = true;
    const layout: [string, string][] = [
      ['fps', 'FPS'],
      ['frame', 'Frame time'],
      ['chunks', 'Active chunks'],
      ['triangles', 'Triangles'],
      ['position', 'XYZ'],
      ['biome', 'Biome'],
      ['mode', 'Mode'],
      ['grounded', 'Player'],
      ['time', 'Time of day'],
      ['light', 'Light'],
      ['shadows', 'Shadows'],
      ['streaming', 'Streaming'],
      ['meshed', 'Meshed / visible'],
      ['vertices', 'Vertices'],
      ['slots', 'GPU slots'],
      ['memory', 'Memory'],
      ['chunk', 'Chunk'],
      ['look', 'Yaw / pitch'],
      ['speed', 'Speed'],
      ['target', 'Target'],
      ['place', 'Holding'],
      ['mining', 'Mining'],
      ['particles', 'Particles'],
      ['world', 'World'],
    ];
    for (const [key, label] of layout) {
      const row = document.createElement('div');
      row.className = 'stats-row';
      const name = document.createElement('span');
      name.className = 'stats-label';
      name.textContent = label;
      const value = document.createElement('span');
      value.className = 'stats-value';
      row.append(name, value);
      root.append(row);
      this.rows.set(key, value);
    }
  }

  get visible(): boolean {
    return this.shown;
  }

  set visible(v: boolean) {
    this.shown = v;
    this.root.hidden = !v;
    this.lastUpdate = -Infinity;
  }

  update(s: EngineStats, now: number): void {
    if (!this.shown || now - this.lastUpdate < this.intervalMs) return;
    this.lastUpdate = now;
    this.set('fps', s.fps.toFixed(0));
    this.set('mode', s.mode);
    this.set('grounded', s.grounded);
    this.set('time', s.timeOfDay);
    this.set('frame', `${s.frameMs.toFixed(2)} ms`);
    this.set('chunks', `${fmt.format(s.chunksLoaded)} loaded · ${fmt.format(s.meshedChunks)} meshed`);
    this.set('streaming', `${s.chunksPending} queued · ${s.chunksGenerating} gen · ${s.lightQueue} light · ${s.meshQueue} mesh`);
    this.set('light', s.light);
    this.set('world', `seed ${s.seed} · ${fmt.format(s.edits)} edits · ${fmt.format(s.fluidCells)} water cells`);
    this.set('meshed', `${s.meshedChunks} / ${s.visibleChunks}${s.overflowChunks ? ` (${s.overflowChunks} overflow)` : ''}`);
    this.set('vertices', fmt.format(s.vertices));
    this.set('triangles', fmt.format(s.triangles));
    this.set('slots', `voxel ${s.voxelSlotsUsed}/${s.voxelSlotsTotal} · mesh ${s.meshSlotsUsed}/${s.meshSlotsTotal}`);
    this.set('memory', `GPU ${s.gpuMemoryMB.toFixed(0)} MB · CPU voxels ${fmt.format(Math.round(s.cpuVoxelKB))} KB`);
    this.set('position', `${s.camera.x.toFixed(1)}, ${s.camera.y.toFixed(1)}, ${s.camera.z.toFixed(1)}`);
    this.set('chunk', `${s.chunk.x}, ${s.chunk.y}, ${s.chunk.z}`);
    this.set('look', `${((s.camera.yaw * 180) / Math.PI).toFixed(0)}° / ${((s.camera.pitch * 180) / Math.PI).toFixed(0)}°`);
    this.set('speed', `${s.speed.toFixed(1)} m/s`);
    this.set('target', s.target);
    this.set('place', s.placeBlock);
    this.set('biome', s.biome);
    this.set('shadows', s.shadows);
    this.set('mining', s.mining);
    this.set('particles', String(s.particles));
  }

  private set(key: string, text: string): void {
    const el = this.rows.get(key);
    if (el && el.textContent !== text) el.textContent = text;
  }
}
