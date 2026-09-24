/**
 * Frame timing: clamped per-frame delta, FPS averaged over a sliding window and an
 * exponentially smoothed frame time.
 */
export class FrameTimer {
  fps = 0;
  frameMs = 0;
  private last = -1;
  private windowStart = -1;
  private windowFrames = 0;

  constructor(private readonly windowMs = 500, private readonly maxDelta = 0.1) {}

  /** Registers a frame at `nowMs` and returns the (clamped) delta time in seconds. */
  tick(nowMs: number): number {
    if (this.last < 0) {
      this.last = nowMs;
      this.windowStart = nowMs;
      return 0;
    }
    const deltaMs = Math.max(0, nowMs - this.last);
    this.last = nowMs;
    this.frameMs = this.frameMs === 0 ? deltaMs : this.frameMs + (deltaMs - this.frameMs) * 0.1;
    this.windowFrames++;
    const elapsed = nowMs - this.windowStart;
    if (elapsed >= this.windowMs) {
      this.fps = (this.windowFrames * 1000) / elapsed;
      this.windowFrames = 0;
      this.windowStart = nowMs;
    }
    return Math.min(this.maxDelta, deltaMs / 1000);
  }
}
