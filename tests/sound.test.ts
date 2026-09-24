import { describe, expect, it } from 'vitest';
import { SoundEngine, materialOf } from '../src/audio/sound';
import { BlockType } from '../src/world/block';
import { mulberry32 } from './helpers';

/** AudioParam stand-in that enforces the Web Audio rules the synthesizer relies on. */
class FakeParam {
  value = 1;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); return this; }
  setTargetAtTime(v: number, t: number) { this.events.push(['target', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number) {
    if (!(v > 0) || !Number.isFinite(v)) throw new RangeError(`exponential ramp to ${v}`);
    this.events.push(['exp', v, t]);
    return this;
  }
}

class FakeNode {
  connections: FakeNode[] = [];
  connect(n: FakeNode) { this.connections.push(n); return n; }
}

class FakeContext {
  currentTime = 1;
  sampleRate = 8000;
  state: AudioContextState = 'suspended';
  resumed = 0;
  destination = new FakeNode();
  sources = 0;
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  createGain() { return Object.assign(new FakeNode(), { gain: new FakeParam() }); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }); }
  createDynamicsCompressor() { return Object.assign(new FakeNode(), { threshold: new FakeParam(), ratio: new FakeParam() }); }
  createBuffer(_c: number, length: number) { const d = new Float32Array(length); return { getChannelData: () => d, length }; }
  createBufferSource() {
    this.sources++;
    return Object.assign(new FakeNode(), {
      buffer: null,
      start: (when: number, offset: number, duration: number) => { if (!(duration > 0) || offset < 0 || when < 0) throw new Error('bad start'); },
    });
  }
  createOscillator() {
    this.sources++;
    return Object.assign(new FakeNode(), { type: 'sine', frequency: new FakeParam(), start() {}, stop() {} });
  }
}

function engine(): { sound: SoundEngine; ctx: FakeContext } {
  const ctx = new FakeContext();
  const sound = new SoundEngine(() => ctx as unknown as AudioContext, mulberry32(3));
  return { sound, ctx };
}

describe('procedural sound', () => {
  it('maps blocks to footstep materials', () => {
    expect(materialOf(BlockType.Stone)).toBe('stone');
    expect(materialOf(BlockType.Cobblestone)).toBe('stone');
    expect(materialOf(BlockType.Grass)).toBe('grass');
    expect(materialOf(BlockType.Sand)).toBe('sand');
    expect(materialOf(BlockType.Snow)).toBe('snow');
    expect(materialOf(BlockType.PineWood)).toBe('wood');
    expect(materialOf(BlockType.Glass)).toBe('glass');
    expect(materialOf(BlockType.WaterFlow4)).toBe('water');
  });

  it('stays silent until unlocked by a user gesture', () => {
    const { sound, ctx } = engine();
    sound.footstep('stone');
    expect(ctx.sources).toBe(0);
    sound.unlock();
    expect(ctx.resumed).toBe(1);
    sound.footstep('stone');
    expect(ctx.sources).toBeGreaterThan(0);
  });

  it('synthesizes every effect for every material with valid parameter ramps', () => {
    const { sound, ctx } = engine();
    sound.unlock();
    for (const m of ['stone', 'dirt', 'grass', 'sand', 'snow', 'wood', 'glass', 'leaves', 'water'] as const) {
      expect(() => { sound.footstep(m, 0.4); sound.breakBlock(m); sound.placeBlock(m); }).not.toThrow();
    }
    expect(() => sound.splash(1)).not.toThrow();
    expect(() => sound.splash(0.05)).not.toThrow();
    expect(ctx.sources).toBe(sound.played);
    expect(sound.played).toBeGreaterThan(60);
  });

  it('differentiates materials: sand crunches in grains, stone clicks once', () => {
    const { sound, ctx } = engine();
    sound.unlock();
    const count = (fn: () => void) => { const before = ctx.sources; fn(); return ctx.sources - before; };
    expect(count(() => sound.footstep('sand'))).toBeGreaterThan(count(() => sound.footstep('stone')));
  });

  it('applies and clamps the master volume; volume 0 mutes', () => {
    const { sound, ctx } = engine();
    sound.unlock();
    sound.setVolume(3);
    expect(sound.volume).toBe(1);
    sound.setVolume(0);
    const before = ctx.sources;
    sound.breakBlock('stone');
    expect(ctx.sources).toBe(before);
  });

  it('is a harmless no-op where Web Audio does not exist', () => {
    const sound = new SoundEngine(null);
    sound.unlock();
    expect(() => sound.footstep('stone')).not.toThrow();
    expect(sound.played).toBe(0);
  });
});
