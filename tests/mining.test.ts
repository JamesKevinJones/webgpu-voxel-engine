import { describe, expect, it } from 'vitest';
import { HOTBAR_BLOCKS, HotbarModel, MAX_STACK, START_COUNTS, dropFor, itemName } from '../src/core/hotbar';
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
  it('holds nine items including torches and a water bucket', () => {
    expect(HOTBAR_BLOCKS).toEqual([
      BlockType.Stone, BlockType.Dirt, BlockType.Grass, BlockType.Sand, BlockType.Wood,
      BlockType.Glass, BlockType.Brick, BlockType.Torch, BlockType.Water,
    ]);
    expect(START_COUNTS).toHaveLength(9);
    expect(itemName(BlockType.Water)).toBe('Water Bucket');
    expect(itemName(BlockType.Torch)).toBe('Torch');
  });

  it('consumes items when placing and collects drops when mining', () => {
    const h = new HotbarModel();
    h.select(7);
    const torches = h.count;
    expect(h.consume()).toBe(true);
    expect(h.count).toBe(torches - 1);
    expect(h.collect(BlockType.Torch)).toBe(7);
    expect(h.count).toBe(torches);
    expect(h.collect(BlockType.PineWood)).toBe(4);
    expect(dropFor(BlockType.Cobblestone)).toBe(BlockType.Stone);
    expect(h.collect(BlockType.Leaves)).toBe(-1);
    h.counts[7] = 0;
    expect(h.consume()).toBe(false);
    h.counts[0] = MAX_STACK;
    h.collect(BlockType.Stone);
    expect(h.counts[0]).toBe(MAX_STACK);
  });

  it('saves and restores the selection and stacks', () => {
    const h = new HotbarModel();
    h.select(3);
    h.consume();
    const other = new HotbarModel();
    other.load(h.save());
    expect(other.selected).toBe(3);
    expect(other.counts).toEqual(h.counts);
    other.load({ selected: 99, counts: [-5, 1e9] });
    expect(other.counts[0]).toBe(0);
    expect(other.counts[1]).toBe(MAX_STACK);
  });

  it('selects slots with keys 1–9 and cycles with the wheel', () => {
    const h = new HotbarModel();
    expect(HotbarModel.slotForKey('Digit7')).toBe(6);
    expect(HotbarModel.slotForKey('Digit0')).toBe(-1);
    expect(HotbarModel.slotForKey('KeyA')).toBe(-1);
    h.select(HotbarModel.slotForKey('Digit9'));
    expect(h.block).toBe(BlockType.Water);
    h.scroll(1);
    expect(h.selected).toBe(0);
    h.scroll(-1);
    expect(h.selected).toBe(8);
    h.select(42);
    expect(h.selected).toBe(8);
  });
});
