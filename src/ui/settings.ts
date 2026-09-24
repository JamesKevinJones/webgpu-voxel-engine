/** Player-adjustable settings, persisted per browser (a convenience; failures are ignored). */
export interface Settings {
  /** Master volume 0..1. */
  volume: number;
  /** Vertical field of view in degrees (60..110). */
  fov: number;
  /** Streaming radius in chunks (4..14). */
  renderDistance: number;
  shadows: boolean;
  /** Fog density multiplier (0.25..2). */
  fogDensity: number;
}

export const SETTINGS_LIMITS = {
  volume: [0, 1],
  fov: [60, 110],
  renderDistance: [4, 14],
  fogDensity: [0.25, 2],
} as const;

export const DEFAULT_SETTINGS: Settings = { volume: 0.7, fov: 75, renderDistance: 8, shadows: true, fogDensity: 1 };

const SETTINGS_KEY = 'voxel.settings.v1';
const SEED_KEY = 'voxel.seed.v1';

function clamp(v: unknown, [lo, hi]: readonly [number, number], fallback: number, integer = false): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(hi, Math.max(lo, n));
  return integer ? Math.round(c) : c;
}

/** Fills in defaults and clamps every field of an untrusted settings object. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    volume: clamp(r.volume, SETTINGS_LIMITS.volume, DEFAULT_SETTINGS.volume),
    fov: clamp(r.fov, SETTINGS_LIMITS.fov, DEFAULT_SETTINGS.fov, true),
    renderDistance: clamp(r.renderDistance, SETTINGS_LIMITS.renderDistance, DEFAULT_SETTINGS.renderDistance, true),
    shadows: typeof r.shadows === 'boolean' ? r.shadows : DEFAULT_SETTINGS.shadows,
    fogDensity: clamp(r.fogDensity, SETTINGS_LIMITS.fogDensity, DEFAULT_SETTINGS.fogDensity),
  };
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(storage: KeyStore | null = defaultStorage()): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage: KeyStore | null = defaultStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / blocked storage: settings just do not persist.
  }
}

/**
 * Parses a seed typed by the player: integers are used directly (mod 2^31), anything else is
 * hashed (FNV-1a), and an empty field yields null.
 */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (/^-?\d+$/.test(t)) return Math.abs(Number.parseInt(t, 10)) % 0x80000000;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 0x80000000;
}

export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x7fffffff);
}

export function loadLastSeed(storage: KeyStore | null = defaultStorage()): number | null {
  try {
    const raw = storage?.getItem(SEED_KEY);
    return raw ? parseSeed(raw) : null;
  } catch {
    return null;
  }
}

export function saveLastSeed(seed: number, storage: KeyStore | null = defaultStorage()): void {
  try {
    storage?.setItem(SEED_KEY, String(seed));
  } catch {
    // ignored
  }
}
