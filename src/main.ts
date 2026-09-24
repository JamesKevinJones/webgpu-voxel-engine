import './style.css';
import { installDebugApi } from './core/debug';
import { DEFAULT_ENGINE_OPTIONS, Engine } from './core/engine';
import { WebGpuUnavailableError } from './core/gpu-context';
import { HotbarView } from './core/hotbar';

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!;
const statsRoot = document.querySelector<HTMLElement>('#stats');
const errorBox = document.querySelector<HTMLElement>('#error')!;
const hint = document.querySelector<HTMLElement>('#hint');

function showError(title: string, detail: string): void {
  errorBox.hidden = false;
  errorBox.querySelector('h2')!.textContent = title;
  errorBox.querySelector('p')!.textContent = detail;
}

function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = params.get(name);
  const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function floatParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = Number.parseFloat(params.get(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

const params = new URLSearchParams(location.search);
const options = {
  seed: intParam(params, 'seed', DEFAULT_ENGINE_OPTIONS.seed, 0, 0x7fffffff),
  radius: intParam(params, 'radius', DEFAULT_ENGINE_OPTIONS.radius, 2, 24),
  generationBatch: intParam(params, 'gen', DEFAULT_ENGINE_OPTIONS.generationBatch, 1, 32),
  meshBatch: intParam(params, 'mesh', DEFAULT_ENGINE_OPTIONS.meshBatch, 1, 64),
  offscreen: params.get('offscreen') === '1',
  timeOfDay: floatParam(params, 'time', DEFAULT_ENGINE_OPTIONS.timeOfDay),
  dayLength: floatParam(params, 'daylen', DEFAULT_ENGINE_OPTIONS.dayLength),
};

try {
  const engine = await Engine.create(canvas, statsRoot, options);
  const device = engine.gpu.device;
  device.addEventListener('uncapturederror', (event) => {
    const message = (event as GPUUncapturedErrorEvent).error.message;
    console.error('WebGPU error:', message);
    showError('WebGPU validation error', message);
  });
  void device.lost.then((info) => {
    console.error(`GPU device lost (${info.reason}): ${info.message}`);
    engine.stop();
    if (info.reason !== 'destroyed') showError('GPU device lost', info.message || String(info.reason));
  });
  document.addEventListener('pointerlockchange', () => {
    if (hint) hint.hidden = document.pointerLockElement === canvas;
  });
  const hotbarRoot = document.querySelector<HTMLElement>('#hotbar');
  if (hotbarRoot) {
    const hotbar = new HotbarView(hotbarRoot, engine.hotbar);
    const refresh = (): void => {
      hotbar.update();
      requestAnimationFrame(refresh);
    };
    requestAnimationFrame(refresh);
  }
  installDebugApi(engine);
  engine.start();
} catch (err) {
  console.error(err);
  if (err instanceof WebGpuUnavailableError) {
    showError('WebGPU unavailable', `${err.message} Try a recent Chrome, Edge or Safari Technology Preview.`);
  } else {
    showError('Failed to start the engine', err instanceof Error ? err.message : String(err));
  }
}
