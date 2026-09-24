/** Fixed-capacity free-list allocator for GPU buffer slots. O(1) alloc/free. */
export class SlotAllocator {
  private readonly freeList: Int32Array;
  private readonly allocated: Uint8Array;
  private freeCount: number;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError(`invalid slot capacity ${capacity}`);
    this.freeList = new Int32Array(capacity);
    this.allocated = new Uint8Array(capacity);
    // Hand out low slot numbers first.
    for (let i = 0; i < capacity; i++) this.freeList[i] = capacity - 1 - i;
    this.freeCount = capacity;
  }

  get used(): number {
    return this.capacity - this.freeCount;
  }

  get available(): number {
    return this.freeCount;
  }

  /** Returns a free slot index, or -1 when exhausted. */
  alloc(): number {
    if (this.freeCount === 0) return -1;
    const slot = this.freeList[--this.freeCount]!;
    this.allocated[slot] = 1;
    return slot;
  }

  free(slot: number): void {
    if (slot < 0 || slot >= this.capacity || this.allocated[slot] === 0) {
      throw new Error(`slot ${slot} is not allocated`);
    }
    this.allocated[slot] = 0;
    this.freeList[this.freeCount++] = slot;
  }

  isAllocated(slot: number): boolean {
    return slot >= 0 && slot < this.capacity && this.allocated[slot] === 1;
  }
}
