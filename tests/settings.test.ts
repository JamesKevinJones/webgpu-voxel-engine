import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSeed, randomSeed, sanitizeSettings, saveSettings } from '../src/ui/settings';

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('settings', () => {
  it('clamps every field to its slider range and fills defaults', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ volume: 4, fov: 10, renderDistance: 99.4, shadows: 'yes', fogDensity: -1 })).toEqual({
      volume: 1, fov: 60, renderDistance: 14, shadows: true, fogDensity: 0.25,
    });
    expect(sanitizeSettings({ fov: '95.6', renderDistance: 4.4 })).toMatchObject({ fov: 96, renderDistance: 4 });
  });

  it('round-trips through storage and survives corrupt or unavailable storage', () => {
    const s = new MemStorage();
    const custom = { ...DEFAULT_SETTINGS, fov: 100, shadows: false };
    saveSettings(custom, s);
    expect(loadSettings(s)).toEqual(custom);
    s.setItem('voxel.settings.v1', '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(custom, broken)).not.toThrow();
  });

  it('parses numeric and text seeds deterministically', () => {
    expect(parseSeed(' 1337 ')).toBe(1337);
    expect(parseSeed('-42')).toBe(42);
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('hello world')).toBe(parseSeed('hello world'));
    expect(parseSeed('hello world')).not.toBe(parseSeed('hello worle'));
    const s = parseSeed('a very long seed phrase')!;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(0x80000000);
    expect(randomSeed(() => 0.5)).toBe(Math.floor(0.5 * 0x7fffffff));
  });
});
