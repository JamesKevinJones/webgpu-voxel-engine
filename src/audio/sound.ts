import { BlockType, isWater } from '../world/block';

/** Surface families with distinct procedural sounds. */
export type Material = 'stone' | 'dirt' | 'grass' | 'sand' | 'snow' | 'wood' | 'glass' | 'leaves' | 'water';

export function materialOf(block: number): Material {
  if (isWater(block)) return 'water';
  switch (block) {
    case BlockType.Grass:
    case BlockType.TallGrass:
    case BlockType.RedFlower:
    case BlockType.YellowFlower:
      return 'grass';
    case BlockType.Dirt:
      return 'dirt';
    case BlockType.Sand:
    case BlockType.Sandstone:
      return 'sand';
    case BlockType.Snow:
      return 'snow';
    case BlockType.Wood:
    case BlockType.BirchWood:
    case BlockType.PineWood:
    case BlockType.Cactus:
    case BlockType.Torch:
      return 'wood';
    case BlockType.Glass:
    case BlockType.Ice:
      return 'glass';
    case BlockType.Leaves:
    case BlockType.PineLeaves:
      return 'leaves';
    default:
      return 'stone';
  }
}

/** What the engine asks for; the implementation below synthesizes everything procedurally. */
export interface SoundSink {
  footstep(material: Material, intensity?: number): void;
  breakBlock(material: Material): void;
  placeBlock(material: Material): void;
  splash(strength: number): void;
}

interface NoiseBurst {
  at: number;
  duration: number;
  filter: BiquadFilterType;
  frequency: number;
  /** Filter frequency at the end of the burst (exponential ramp). */
  frequencyEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
}

interface Tone {
  at: number;
  duration: number;
  type: OscillatorType;
  frequency: number;
  frequencyEnd: number;
  gain: number;
}

/** Filter centre, bandwidth and level of each material's footstep. */
const STEP: Record<Material, { filter: BiquadFilterType; frequency: number; q: number; duration: number; gain: number; thump: number }> = {
  stone: { filter: 'bandpass', frequency: 2400, q: 1.3, duration: 0.05, gain: 0.55, thump: 0.3 },
  dirt: { filter: 'lowpass', frequency: 700, q: 0.8, duration: 0.09, gain: 0.7, thump: 0.25 },
  grass: { filter: 'lowpass', frequency: 1100, q: 0.6, duration: 0.13, gain: 0.5, thump: 0.12 },
  leaves: { filter: 'bandpass', frequency: 1800, q: 0.5, duration: 0.14, gain: 0.45, thump: 0.05 },
  sand: { filter: 'bandpass', frequency: 3200, q: 0.7, duration: 0.17, gain: 0.45, thump: 0.08 },
  snow: { filter: 'bandpass', frequency: 1500, q: 0.9, duration: 0.2, gain: 0.5, thump: 0.08 },
  wood: { filter: 'bandpass', frequency: 900, q: 2.5, duration: 0.07, gain: 0.45, thump: 0.35 },
  glass: { filter: 'highpass', frequency: 3500, q: 0.7, duration: 0.05, gain: 0.35, thump: 0.15 },
  water: { filter: 'lowpass', frequency: 1300, q: 1, duration: 0.2, gain: 0.5, thump: 0 },
};

/**
 * Zero-asset sound effects synthesized with the Web Audio API: filtered white-noise bursts and
 * oscillator sweeps, randomised slightly on every call so repeated sounds do not feel canned.
 * The AudioContext is created lazily by `unlock()`, which must run inside a user gesture.
 */
export class SoundEngine implements SoundSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volumeValue = 0.7;
  /** Sounds started (for tests and stats). */
  played = 0;

  constructor(private readonly factory: (() => AudioContext) | null = typeof AudioContext === 'undefined' ? null : () => new AudioContext(),
    private readonly random: () => number = Math.random) {}

  get volume(): number {
    return this.volumeValue;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Creates / resumes the audio context (call from a click or key handler). */
  unlock(): void {
    if (!this.factory) return;
    if (!this.ctx) {
      this.ctx = this.factory();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumeValue;
      // A gentle compressor keeps overlapping bursts from clipping.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 6;
      this.master.connect(limiter).connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 1.0);
      this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = this.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(volume: number): void {
    this.volumeValue = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volumeValue, this.ctx.currentTime, 0.02);
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed' && this.volumeValue > 0;
  }

  private jitter(amount: number): number {
    return 1 + (this.random() * 2 - 1) * amount;
  }

  private burst(b: NoiseBurst): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = b.filter;
    filter.frequency.setValueAtTime(b.frequency, b.at);
    if (b.frequencyEnd) filter.frequency.exponentialRampToValueAtTime(b.frequencyEnd, b.at + b.duration);
    filter.Q.value = b.q ?? 1;
    const env = ctx.createGain();
    const attack = b.attack ?? 0.003;
    env.gain.setValueAtTime(0.0001, b.at);
    env.gain.exponentialRampToValueAtTime(b.gain, b.at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, b.at + b.duration);
    src.connect(filter).connect(env).connect(this.master!);
    // Random offset into the noise buffer so consecutive bursts differ.
    src.start(b.at, this.random() * 0.7, b.duration + 0.02);
    this.played++;
  }

  private tone(t: Tone): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = t.type;
    osc.frequency.setValueAtTime(t.frequency, t.at);
    osc.frequency.exponentialRampToValueAtTime(t.frequencyEnd, t.at + t.duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t.at);
    env.gain.exponentialRampToValueAtTime(t.gain, t.at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t.at + t.duration);
    osc.connect(env).connect(this.master!);
    osc.start(t.at);
    osc.stop(t.at + t.duration + 0.02);
    this.played++;
  }

  /** Footstep click/thud filtered by the ground material. */
  footstep(material: Material, intensity = 1): void {
    if (!this.ready || !(intensity > 0)) return;
    if (material === 'water') {
      this.splash(0.25 * intensity);
      return;
    }
    const s = STEP[material];
    const now = this.ctx!.currentTime;
    const gain = s.gain * intensity * this.jitter(0.15);
    this.burst({ at: now, duration: s.duration * this.jitter(0.2), filter: s.filter, frequency: s.frequency * this.jitter(0.12), q: s.q, gain });
    if (material === 'sand' || material === 'snow' || material === 'grass') {
      // Granular crunch: a couple of quieter grains right after the first.
      for (let i = 1; i <= 2; i++) {
        this.burst({ at: now + i * 0.03 * this.jitter(0.3), duration: s.duration * 0.5, filter: s.filter, frequency: s.frequency * this.jitter(0.25), q: s.q, gain: gain * 0.5 });
      }
    }
    if (s.thump > 0) {
      this.tone({ at: now, duration: 0.07, type: 'sine', frequency: 140 * this.jitter(0.1), frequencyEnd: 60, gain: s.thump * intensity });
    }
    if (material === 'wood') {
      this.tone({ at: now, duration: 0.09, type: 'triangle', frequency: 260 * this.jitter(0.08), frequencyEnd: 170, gain: 0.18 * intensity });
    }
  }

  /** Crunch: a train of noise bursts whose filter sweeps downwards, plus a low thud. */
  breakBlock(material: Material): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (material === 'glass') {
      this.burst({ at: now, duration: 0.25, filter: 'highpass', frequency: 3000, gain: 0.5 });
      for (let i = 0; i < 5; i++) {
        const f = 1800 + this.random() * 3200;
        this.tone({ at: now + this.random() * 0.12, duration: 0.12 + this.random() * 0.15, type: 'sine', frequency: f, frequencyEnd: f * 0.97, gain: 0.08 });
      }
      return;
    }
    const s = STEP[material];
    const top = Math.min(4000, s.frequency * 1.3);
    for (let i = 0; i < 5; i++) {
      const at = now + i * 0.028 * this.jitter(0.3);
      this.burst({ at, duration: 0.07 * this.jitter(0.3), filter: 'bandpass', frequency: top * this.jitter(0.2), frequencyEnd: Math.max(200, top * 0.3), q: 0.9, gain: 0.6 * (1 - i * 0.14) });
    }
    this.tone({ at: now, duration: 0.12, type: 'sine', frequency: 110 * this.jitter(0.1), frequencyEnd: 45, gain: 0.35 });
  }

  /** Pop: a quick downward sine sweep with a tiny click on top. */
  placeBlock(material: Material): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (material === 'water') {
      this.splash(0.6);
      return;
    }
    const base = material === 'glass' ? 900 : material === 'wood' ? 420 : material === 'stone' ? 520 : 480;
    this.tone({ at: now, duration: 0.08, type: 'sine', frequency: base * this.jitter(0.06), frequencyEnd: base * 0.35, gain: 0.5 });
    this.burst({ at: now, duration: 0.015, filter: 'highpass', frequency: 2500, gain: 0.25 });
    this.burst({ at: now + 0.005, duration: 0.06, filter: 'lowpass', frequency: STEP[material].frequency, gain: 0.25 });
  }

  /** Splash: a low-passed noise wash sweeping down plus a few rising bubble chirps. */
  splash(strength: number): void {
    if (!this.ready || strength <= 0) return;
    const now = this.ctx!.currentTime;
    const s = Math.min(1, strength);
    this.burst({ at: now, duration: 0.25 + 0.35 * s, filter: 'lowpass', frequency: 2600 * this.jitter(0.1), frequencyEnd: 350, q: 0.7, gain: 0.3 + 0.5 * s, attack: 0.01 });
    const bubbles = 2 + Math.round(4 * s);
    for (let i = 0; i < bubbles; i++) {
      const f = 350 + this.random() * 500;
      this.tone({ at: now + 0.05 + this.random() * 0.3, duration: 0.04 + this.random() * 0.04, type: 'sine', frequency: f, frequencyEnd: f * 2.2, gain: 0.06 + 0.08 * s });
    }
  }
}
