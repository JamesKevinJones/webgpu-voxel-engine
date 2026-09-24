import './style.css';
import { DEFAULT_ENGINE_OPTIONS, type EngineOptions } from './core/engine';
import { GpuContext, WebGpuUnavailableError } from './core/gpu-context';
import { Game } from './ui/game';

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
const errorBox = document.querySelector<HTMLElement>('#error')!;

function showError(title: string, detail: string): void {
  errorBox.hidden = false;
  errorBox.querySelector('h2')!.textContent = title;
  errorBox.querySelector('p')!.textContent = detail;
}

function intParam(params: URLSearchParams, name: string, min: number, max: number): number | null {
  const raw = params.get(name);
  const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
}

function floatParam(params: URLSearchParams, name: string): number | null {
  const value = Number.parseFloat(params.get(name) ?? '');
  return Number.isFinite(value) ? value : null;
}

const params = new URLSearchParams(location.search);
const offscreen = params.get('offscreen') === '1';
const engine: Partial<EngineOptions> = {};
const gen = intParam(params, 'gen', 1, 32);
const mesh = intParam(params, 'mesh', 1, 64);
const time = floatParam(params, 'time');
const dayLength = floatParam(params, 'daylen');
if (gen !== null) engine.generationBatch = gen;
if (mesh !== null) engine.meshBatch = mesh;
engine.timeOfDay = time ?? DEFAULT_ENGINE_OPTIONS.timeOfDay;
if (dayLength !== null) engine.dayLength = dayLength;

try {
  const gpu = await GpuContext.create(canvas, { offscreen });
  const device = gpu.device;
  device.addEventListener('uncapturederror', (event) => {
    const message = (event as GPUUncapturedErrorEvent).error.message;
    console.error('WebGPU error:', message);
    showError('WebGPU validation error', message);
  });
  void device.lost.then((info) => {
    console.error(`GPU device lost (${info.reason}): ${info.message}`);
    if (info.reason !== 'destroyed') showError('GPU device lost', `${info.message || String(info.reason)}\nReload the page to continue.`);
  });
  const game = new Game(gpu, {
    // Headless automation renders offscreen and cannot use pointer lock: skip the title screen
    // (unless ?autostart=0 asks for it, to test the menus).
    autostart: params.get('autostart') === '1' || (offscreen && params.get('autostart') !== '0'),
    seed: intParam(params, 'seed', 0, 0x7fffffff),
    radius: intParam(params, 'radius', 2, 24),
    engine,
  });
  await game.boot();
} catch (err) {
  console.error(err);
  if (err instanceof WebGpuUnavailableError) {
    showError('WebGPU unavailable', `${err.message}\nVoxel Frontier needs WebGPU: try a recent Chrome or Edge (113+), or Safari 26.`);
  } else {
    showError('Failed to start', err instanceof Error ? err.message : String(err));
  }
}
