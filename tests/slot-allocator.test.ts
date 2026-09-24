import { describe, expect, it } from 'vitest';
import { SlotAllocator } from '../src/world/slot-allocator';

describe('SlotAllocator', () => {
  it('hands out unique slots until exhausted', () => {
    const a = new SlotAllocator(4);
    const slots = [a.alloc(), a.alloc(), a.alloc(), a.alloc()];
    expect(slots).toEqual([0, 1, 2, 3]);
    expect(a.alloc()).toBe(-1);
    expect(a.used).toBe(4);
    expect(a.available).toBe(0);
  });

  it('reuses freed slots and tracks allocation state', () => {
    const a = new SlotAllocator(3);
    a.alloc();
    const b = a.alloc();
    a.free(b);
    expect(a.isAllocated(b)).toBe(false);
    expect(a.alloc()).toBe(b);
    expect(a.isAllocated(b)).toBe(true);
    expect(a.isAllocated(99)).toBe(false);
  });

  it('rejects double frees and invalid capacities', () => {
    const a = new SlotAllocator(2);
    const s = a.alloc();
    a.free(s);
    expect(() => a.free(s)).toThrow();
    expect(() => a.free(5)).toThrow();
    expect(() => new SlotAllocator(0)).toThrow(RangeError);
  });
});
