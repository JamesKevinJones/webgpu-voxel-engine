import { SoundEngine } from '../audio/sound';
import { installDebugApi } from '../core/debug';
import { Engine, type EngineOptions, type EngineWorldState } from '../core/engine';
import type { GpuContext } from '../core/gpu-context';
import { HotbarView } from '../core/hotbar';
import { WorldDelta } from '../storage/delta';
import { IndexedDbStore, MemoryStore, WorldStore, type KeyValueStore } from '../storage/world-store';
import {
  SETTINGS_LIMITS,
  loadLastSeed,
  loadSettings,
  parseSeed,
  randomSeed,
  saveLastSeed,
  saveSettings,
  type Settings,
} from './settings';

export type GameState = 'loading' | 'title' | 'playing' | 'paused';

export interface GameOptions {
  /** Skip the title screen and play immediately without pointer lock (automation, `?autostart=1`). */
  autostart: boolean;
  /** Seed from the URL (overrides the last played seed). */
  seed: number | null;
  /** Render distance from the URL (overrides the setting). */
  radius: number | null;
  /** Extra engine options from the URL (batch sizes, time of day, day length). */
  engine: Partial<EngineOptions>;
}

const AUTOSAVE_MS = 30_000;

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

/**
 * The game shell around the engine: title screen (seed, controls, live world backdrop), pointer
 * lock, pause menu with settings, HUD (crosshair, hotbar, toasts), F3 overlay, auto-save to
 * IndexedDB every 30 s and world reset. Engines are recreated (on the same GPU device) when the
 * seed or the render distance changes.
 */
export class Game {
  engine: Engine | null = null;
  state: GameState = 'loading';
  readonly sound = new SoundEngine();
  settings: Settings = loadSettings();
  private store: WorldStore | null = null;
  private kv: KeyValueStore | null = null;
  persistent = true;
  private hotbar: HotbarView | null = null;
  private hadLock = false;
  private saving: Promise<number> | null = null;
  private busy = false;
  private resetArmed = 0;
  private toastTimer = 0;
  /** Whether the current world has never been entered (spawn in walking mode on first play). */
  private freshWorld = false;
  /** F3 overlay shown (kept across engine recreation). */
  private debugVisible = false;
  saves = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly el = {
    hud: $('hud'),
    hotbar: $('hotbar'),
    toast: $('toast'),
    stats: $('stats'),
    title: $('title'),
    seedInput: $<HTMLInputElement>('seed-input'),
    randomSeed: $<HTMLButtonElement>('random-seed'),
    play: $<HTMLButtonElement>('play'),
    status: $('title-status'),
    progress: $('title-progress'),
    pause: $('pause'),
    resume: $<HTMLButtonElement>('resume'),
    seedDisplay: $('seed-display'),
    volume: $<HTMLInputElement>('set-volume'),
    fov: $<HTMLInputElement>('set-fov'),
    distance: $<HTMLInputElement>('set-distance'),
    shadows: $<HTMLInputElement>('set-shadows'),
    fog: $<HTMLInputElement>('set-fog'),
    volumeValue: $('volume-value'),
    fovValue: $('fov-value'),
    distanceValue: $('distance-value'),
    fogValue: $('fog-value'),
    distanceNote: $('distance-note'),
    quit: $<HTMLButtonElement>('quit'),
    reset: $<HTMLButtonElement>('reset'),
    pauseNote: $('pause-note'),
    saveState: $('save-state'),
  };

  constructor(readonly gpu: GpuContext, readonly options: GameOptions) {
    this.canvas = gpu.canvas;
    (globalThis as unknown as { __game: Game }).__game = this;
  }

  async boot(): Promise<void> {
    try {
      this.kv = await IndexedDbStore.open();
    } catch (err) {
      console.warn('IndexedDB unavailable, progress will not be saved:', err);
      this.kv = new MemoryStore();
      this.persistent = false;
    }
    this.bindUi();
    this.sound.setVolume(this.settings.volume);
    const seed = this.options.seed ?? loadLastSeed() ?? 1337;
    this.el.seedInput.value = String(seed);
    await this.openWorld(seed);
    if (this.options.autostart) this.enterPlaying();
    else this.setState('title');
    window.setInterval(() => {
      if (this.state === 'playing' || this.state === 'paused') void this.save(true);
    }, AUTOSAVE_MS);
    const flush = () => { if (this.state !== 'loading') void this.save(false); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
    requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------------ worlds

  private get radius(): number {
    return this.options.radius ?? this.settings.renderDistance;
  }

  /** Saves and tears down the current engine, then creates one for `seed` (from storage unless `state` is given). */
  private async openWorld(seed: number, state?: EngineWorldState): Promise<void> {
    this.busy = true;
    try {
      if (this.engine) {
        await this.save(false);
        const old = this.engine;
        this.engine = null;
        await old.shutdown();
      }
      this.store = new WorldStore(this.kv!, seed);
      const loaded = state ?? await this.store.load();
      this.freshWorld = !loaded.player;
      const engine = await Engine.create(this.gpu, this.el.stats, {
        ...this.options.engine,
        seed,
        radius: this.radius,
        fov: this.settings.fov,
        fogDensity: this.settings.fogDensity,
        shadows: this.settings.shadows,
      }, loaded);
      engine.sound = this.sound;
      if (engine.overlay) engine.overlay.visible = this.debugVisible;
      engine.attract = this.state === 'title' || this.state === 'loading';
      engine.paused = this.state === 'paused';
      this.engine = engine;
      if (this.hotbar) this.hotbar.bind(engine.hotbar);
      else this.hotbar = new HotbarView(this.el.hotbar, engine.hotbar);
      installDebugApi(engine);
      engine.start();
      saveLastSeed(seed);
      this.el.seedDisplay.textContent = String(seed);
    } finally {
      this.busy = false;
    }
  }

  /** Writes dirty chunks and the player to IndexedDB. Returns the number of chunk records written. */
  async save(toast: boolean): Promise<number> {
    const engine = this.engine, store = this.store;
    if (!engine || !store) return 0;
    if (this.saving) await this.saving.catch(() => 0);
    this.saving = store.save(engine.delta, engine.snapshot());
    try {
      const n = await this.saving;
      this.saves++;
      if (toast) this.toast(this.persistent ? `World saved${n > 0 ? ` · ${n} chunk${n === 1 ? '' : 's'} updated` : ''}` : 'Saving unavailable in this browser');
      this.el.saveState.textContent = this.persistent ? `Last saved ${new Date().toLocaleTimeString()}` : 'Saving unavailable (private browsing?)';
      return n;
    } catch (err) {
      console.error('save failed', err);
      if (toast) this.toast('Save failed');
      return 0;
    } finally {
      this.saving = null;
    }
  }

  // ------------------------------------------------------------------ state machine

  private setState(state: GameState): void {
    this.state = state;
    document.body.dataset.state = state;
    const e = this.engine;
    if (e) {
      e.attract = state === 'title';
      e.paused = state === 'paused';
    }
    this.el.title.hidden = state !== 'title';
    this.el.pause.hidden = state !== 'paused';
    this.el.hud.hidden = state !== 'playing' && state !== 'paused';
    if (state === 'paused') this.syncSettingsUi();
    if (state !== 'paused') this.disarmReset();
  }

  private enterPlaying(): void {
    if (this.freshWorld && this.engine && !this.options.autostart) this.engine.setMode('walk');
    this.freshWorld = false;
    this.setState('playing');
  }

  /** Must run inside the click handler (pointer lock needs a user gesture). */
  private requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => this.lockFailed());
    } catch {
      this.lockFailed();
    }
  }

  private lockFailed(): void {
    if (this.state === 'playing' && !this.options.autostart) {
      this.setState('paused');
      this.el.pauseNote.textContent = 'Click Resume to grab the mouse again.';
    }
  }

  private readonly onLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      this.hadLock = true;
      this.el.pauseNote.textContent = '';
      if (this.state === 'paused' || this.state === 'title') this.enterPlaying();
    } else if (this.state === 'playing' && this.hadLock) {
      this.setState('paused');
      void this.save(true);
    }
  };

  private async play(): Promise<void> {
    if (this.busy) return;
    this.sound.unlock();
    const seed = parseSeed(this.el.seedInput.value) ?? randomSeed();
    this.el.seedInput.value = String(seed);
    this.requestLock();
    if (!this.engine || seed !== this.engine.options.seed) {
      this.el.status.textContent = 'Generating world…';
      await this.openWorld(seed);
    }
    // The pointer-lock event may already have switched to playing (with the previous world).
    if (this.state === 'title' || this.state === 'playing') this.enterPlaying();
  }

  private async resume(): Promise<void> {
    if (this.busy || !this.engine) return;
    this.sound.unlock();
    this.requestLock();
    if (this.radius !== this.engine.options.radius) {
      this.el.pauseNote.textContent = 'Applying render distance…';
      const state: EngineWorldState = { delta: this.engine.delta, player: this.engine.snapshot() };
      await this.openWorld(this.engine.options.seed, state);
      this.el.pauseNote.textContent = '';
    }
    if (this.options.autostart || document.pointerLockElement === this.canvas) this.enterPlaying();
  }

  private async quitToTitle(): Promise<void> {
    await this.save(true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.el.seedInput.value = String(this.engine?.options.seed ?? '');
    this.setState('title');
  }

  private disarmReset(): void {
    this.resetArmed = 0;
    this.el.reset.textContent = 'Reset World';
    this.el.reset.classList.remove('armed');
  }

  /** Two-step: the first click arms the button, a second click within 4 s wipes the database. */
  private async resetWorld(): Promise<void> {
    if (this.busy || !this.engine || !this.kv) return;
    if (!this.resetArmed || performance.now() - this.resetArmed > 4000) {
      this.resetArmed = performance.now();
      this.el.reset.textContent = 'Click again to erase all saves';
      this.el.reset.classList.add('armed');
      return;
    }
    this.disarmReset();
    const seed = this.engine.options.seed;
    await this.saving?.catch(() => 0);
    await this.kv.clear();
    // Discard the in-memory edits too, so nothing is written back by the teardown save.
    const old = this.engine;
    old.delta.clear();
    this.engine = null;
    await old.shutdown();
    this.setState('title');
    await this.openWorld(seed, { delta: new WorldDelta(), player: null });
    this.toast('World reset · local saves erased');
  }

  // ------------------------------------------------------------------ UI

  private bindUi(): void {
    const e = this.el;
    e.play.addEventListener('click', () => void this.play());
    e.seedInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') void this.play(); });
    e.randomSeed.addEventListener('click', () => { e.seedInput.value = String(randomSeed()); });
    e.resume.addEventListener('click', () => void this.resume());
    e.quit.addEventListener('click', () => void this.quitToTitle());
    e.reset.addEventListener('click', () => void this.resetWorld());
    document.addEventListener('pointerlockchange', this.onLockChange);
    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'F3') {
        ev.preventDefault();
        this.debugVisible = !this.debugVisible;
        const overlay = this.engine?.overlay;
        if (overlay) overlay.visible = this.debugVisible;
      }
    });

    const slider = (input: HTMLInputElement, [min, max]: readonly [number, number], step: number) => {
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
    };
    slider(e.volume, [0, 100], 1);
    slider(e.fov, SETTINGS_LIMITS.fov, 1);
    slider(e.distance, SETTINGS_LIMITS.renderDistance, 1);
    slider(e.fog, [SETTINGS_LIMITS.fogDensity[0] * 100, SETTINGS_LIMITS.fogDensity[1] * 100], 5);
    const update = (): void => {
      const s = this.settings;
      s.volume = Number(e.volume.value) / 100;
      s.fov = Number(e.fov.value);
      s.renderDistance = Number(e.distance.value);
      s.shadows = e.shadows.checked;
      s.fogDensity = Number(e.fog.value) / 100;
      saveSettings(s);
      this.sound.setVolume(s.volume);
      const engine = this.engine;
      if (engine) {
        engine.setFov(s.fov);
        engine.setFogDensity(s.fogDensity);
        engine.shadowsEnabled = s.shadows;
      }
      this.renderSettingLabels();
    };
    for (const input of [e.volume, e.fov, e.distance, e.shadows, e.fog]) input.addEventListener('input', update);
    this.syncSettingsUi();
  }

  private syncSettingsUi(): void {
    const e = this.el, s = this.settings;
    if (this.engine) s.shadows = this.engine.shadowsEnabled; // G toggles shadows in game
    e.volume.value = String(Math.round(s.volume * 100));
    e.fov.value = String(s.fov);
    e.distance.value = String(s.renderDistance);
    e.shadows.checked = s.shadows;
    e.fog.value = String(Math.round(s.fogDensity * 100));
    this.renderSettingLabels();
  }

  private renderSettingLabels(): void {
    const e = this.el, s = this.settings;
    e.volumeValue.textContent = `${Math.round(s.volume * 100)}%`;
    e.fovValue.textContent = `${s.fov}°`;
    e.distanceValue.textContent = `${s.renderDistance} chunks`;
    e.fogValue.textContent = `${Math.round(s.fogDensity * 100)}%`;
    const pending = this.engine && this.radius !== this.engine.options.radius;
    e.distanceNote.textContent = this.options.radius !== null ? 'Fixed by the URL (?radius=)'
      : pending ? 'Applies when you resume (the world reloads around you)' : '';
  }

  toast(message: string): void {
    const t = this.el.toast;
    t.textContent = message;
    t.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
  }

  /** Per-frame UI refresh: hotbar and title-screen loading progress. */
  private readonly tick = (): void => {
    requestAnimationFrame(this.tick);
    this.hotbar?.update();
    if (this.state === 'title' && this.engine) {
      const s = this.engine.chunks.countByState();
      const total = s.pending + s.generating + s.ready;
      const done = total === 0 ? 0 : s.ready / total;
      const meshing = this.engine.chunks.meshQueueSize + this.engine.chunks.lightQueueSize;
      const ready = done >= 1 && meshing === 0;
      this.el.progress.style.width = `${Math.round(done * 100)}%`;
      this.el.status.textContent = this.busy ? 'Generating world…'
        : ready ? `World ready · seed ${this.engine.options.seed}` : `Generating terrain… ${Math.round(done * 100)}%`;
      this.el.title.classList.toggle('ready', ready);
    }
  };
}
