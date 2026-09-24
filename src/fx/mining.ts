import { breakTime, isUnbreakable } from '../world/block';

export const CRACK_STAGE_COUNT = 10;

export interface MiningTarget {
  x: number;
  y: number;
  z: number;
  block: number;
}

export interface MiningUpdate {
  /** Crack stage 0..9 to overlay, or -1 when not mining. */
  stage: number;
  /** The target that broke this update, if any. */
  broken: MiningTarget | null;
}

/**
 * Hold-to-mine progress. Progress accumulates while the button is held on the same voxel, at a
 * rate given by the block's break time, and resets when the target changes or the button is
 * released. Blocks with a break time of 0 (plants) break on the first update.
 */
export class MiningState {
  progress = 0;
  private current: MiningTarget | null = null;

  update(dt: number, holding: boolean, target: MiningTarget | null): MiningUpdate {
    if (!holding || !target || isUnbreakable(target.block)) {
      this.reset();
      return { stage: -1, broken: null };
    }
    const c = this.current;
    if (!c || c.x !== target.x || c.y !== target.y || c.z !== target.z || c.block !== target.block) {
      this.current = { ...target };
      this.progress = 0;
    }
    const time = breakTime(target.block);
    this.progress = time <= 0 ? 1 : this.progress + dt / time;
    if (this.progress >= 1) {
      const broken = this.current!;
      this.reset();
      return { stage: -1, broken };
    }
    return { stage: Math.min(CRACK_STAGE_COUNT - 1, Math.floor(this.progress * CRACK_STAGE_COUNT)), broken: null };
  }

  reset(): void {
    this.progress = 0;
    this.current = null;
  }
}
