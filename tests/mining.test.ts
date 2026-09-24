import { describe, expect, it } from 'vitest';
import { HOTBAR_BLOCKS, HotbarModel } from '../src/core/hotbar';
import { CRACK_STAGE_COUNT, MiningState } from '../src/fx/mining';
import { BlockType, breakTime } from '../src/world/block';

const stone = { x: 1, y: 2, z: 3, block: BlockType.Stone };

describe('mining progress', () => {
  it('advances through all crack stages and breaks after the block break time', () => {
    const m = new MiningState();
    const stages: number[] = [];
    const dt = 1 / 60;
    let broken = null;
    let t = 0;
    while (!broken && t < 10) {
      const r = m.update(dt, true, stone);
      if (r.stage >= 0) stages.push(r.stage);
      broken = r.broken;
      t += dt;
    }
    expect(broken).toEqual(stone);
    expect(t).toBeCloseTo(breakTime(BlockType.Stone), 1);
    expect(new Set(stages)).toEqual(new Set(Array.from({ length: CRACK_STAGE_COUNT }, (_, i) => i)));
    for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1]!);
  });

  it('resets when the button is released or the target changes', () => {
    const m = new MiningState();
    m.update(0.5, true, stone);
    expect(m.progress).toBeGreaterThan(0);
    expect(m.update(0.1, false, stone).stage).toBe(-1);
    expect(m.progress).toBe(0);
    m.update(0.5, true, stone);
    const r = m.update(0.01, true, { ...stone, x: 2 });
    expect(m.progress).toBeLessThan(0.05);
    expect(r.broken).toBeNull();
  });

  it('breaks plants instantly and never breaks bedrock', () => {
    const m = new MiningState();
    expect(m.update(0.001, true, { ...stone, block: BlockType.TallGrass }).broken).not.toBeNull();
    for (let i = 0; i < 1000; i++) expect(m.update(0.1, true, { ...stone, block: BlockType.Bedrock }).broken).toBeNull();
  });
});

describe('hotbar', () => {
  it('holds the nine requested blocks', () => {
    expect(HOTBAR_BLOCKS).toEqual([
      BlockType.Stone, BlockType.Dirt, BlockType.Grass, BlockType.Sand, BlockType.Wood,
      BlockType.Leaves, BlockType.Glass, BlockType.Cobblestone, BlockType.Brick,
    ]);
  });

  it('selects slots with keys 1–9 and cycles with the wheel', () => {
    const h = new HotbarModel();
    expect(HotbarModel.slotForKey('Digit7')).toBe(6);
    expect(HotbarModel.slotForKey('Digit0')).toBe(-1);
    expect(HotbarModel.slotForKey('KeyA')).toBe(-1);
    h.select(HotbarModel.slotForKey('Digit9'));
    expect(h.block).toBe(BlockType.Brick);
    h.scroll(1);
    expect(h.selected).toBe(0);
    h.scroll(-1);
    expect(h.selected).toBe(8);
    h.select(42);
    expect(h.selected).toBe(8);
  });
});
