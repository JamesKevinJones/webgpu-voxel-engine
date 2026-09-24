export interface EngineStats {
  fps: number;
  frameMs: number;
  chunksLoaded: number;
  chunksPending: number;
  chunksGenerating: number;
  meshQueue: number;
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
  seed: number;
}

const fmt = new Intl.NumberFormat('en-US');

/** Lightweight DOM overlay; refreshed a few times per second to keep layout work negligible. */
export class StatsOverlay {
  private readonly rows = new Map<string, HTMLElement>();
  private lastUpdate = -Infinity;

  constructor(root: HTMLElement, private readonly intervalMs = 200) {
    root.classList.add('stats');
    const layout: [string, string][] = [
      ['fps', 'FPS'],
      ['mode', 'Mode'],
      ['grounded', 'Player'],
      ['time', 'Time of day'],
      ['frame', 'Frame'],
      ['chunks', 'Chunks'],
      ['streaming', 'Streaming'],
      ['meshed', 'Meshed / visible'],
      ['vertices', 'Vertices'],
      ['triangles', 'Triangles'],
      ['slots', 'GPU slots'],
      ['memory', 'Memory'],
      ['position', 'Position'],
      ['chunk', 'Chunk'],
      ['look', 'Yaw / pitch'],
      ['speed', 'Speed'],
      ['target', 'Target'],
      ['place', 'Place block'],
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

  update(s: EngineStats, now: number): void {
    if (now - this.lastUpdate < this.intervalMs) return;
    this.lastUpdate = now;
    this.set('fps', s.fps.toFixed(0));
    this.set('mode', s.mode);
    this.set('grounded', s.grounded);
    this.set('time', s.timeOfDay);
    this.set('frame', `${s.frameMs.toFixed(2)} ms`);
    this.set('chunks', `${fmt.format(s.chunksLoaded)} ready`);
    this.set('streaming', `${s.chunksPending} queued · ${s.chunksGenerating} gen · ${s.meshQueue} mesh`);
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
  }

  private set(key: string, text: string): void {
    const el = this.rows.get(key);
    if (el && el.textContent !== text) el.textContent = text;
  }
}
