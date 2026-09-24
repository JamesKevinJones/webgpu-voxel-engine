/**
 * A small pool of MAP_READ staging buffers for asynchronous GPU → CPU readbacks.
 * Acquire a buffer while encoding, copy into it, submit, then call `read` which maps it,
 * hands the bytes to the callback and returns the buffer to the pool.
 */
export class StagingPool {
  private readonly free: GPUBuffer[] = [];
  private readonly all: GPUBuffer[] = [];

  constructor(device: GPUDevice, readonly size: number, count: number, label: string) {
    for (let i = 0; i < count; i++) {
      const buffer = device.createBuffer({
        label: `${label} staging ${i}`,
        size,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      this.free.push(buffer);
      this.all.push(buffer);
    }
  }

  get available(): number {
    return this.free.length;
  }

  acquire(): GPUBuffer | null {
    return this.free.pop() ?? null;
  }

  /** Maps `buffer` (after the copy into it was submitted) and returns it to the pool afterwards. */
  async read<T>(buffer: GPUBuffer, byteLength: number, fn: (data: ArrayBuffer) => T): Promise<T> {
    try {
      await buffer.mapAsync(GPUMapMode.READ, 0, byteLength);
      try {
        return fn(buffer.getMappedRange(0, byteLength));
      } finally {
        buffer.unmap();
      }
    } finally {
      this.free.push(buffer);
    }
  }

  /** Returns a buffer acquired but never submitted. */
  release(buffer: GPUBuffer): void {
    this.free.push(buffer);
  }

  destroy(): void {
    for (const b of this.all) b.destroy();
  }
}
