/**
 * Keyboard / mouse state with pointer lock. Mouse movement and clicks are accumulated between
 * frames and consumed once per frame by the controller.
 */
export class InputState {
  readonly keys = new Set<string>();
  pointerLocked = false;
  private mouseDX = 0;
  private mouseDY = 0;
  private wheel = 0;
  private clicks: number[] = [];
  private readonly listeners: [EventTarget, string, EventListener][] = [];

  attach(canvas: HTMLCanvasElement): void {
    const on = <K extends string>(target: EventTarget, type: K, fn: (e: Event) => void): void => {
      target.addEventListener(type, fn);
      this.listeners.push([target, type, fn]);
    };
    on(window, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      this.keys.add(ke.code);
      if (this.pointerLocked && ['Space', 'Tab'].includes(ke.code)) ke.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    on(window, 'blur', () => this.keys.clear());
    on(canvas, 'click', () => {
      if (!this.pointerLocked) void canvas.requestPointerLock();
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.keys.clear();
    });
    on(document, 'mousemove', (e) => {
      if (!this.pointerLocked) return;
      const me = e as MouseEvent;
      this.mouseDX += me.movementX;
      this.mouseDY += me.movementY;
    });
    on(canvas, 'mousedown', (e) => {
      if (this.pointerLocked) this.clicks.push((e as MouseEvent).button);
    });
    on(canvas, 'wheel', (e) => {
      this.wheel += Math.sign((e as WheelEvent).deltaY);
      e.preventDefault();
    });
  }

  detach(): void {
    for (const [target, type, fn] of this.listeners) target.removeEventListener(type, fn);
    this.listeners.length = 0;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Returns and clears the accumulated mouse movement (pixels). */
  consumeMouse(out: [number, number]): [number, number] {
    out[0] = this.mouseDX;
    out[1] = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeClicks(): number[] {
    const c = this.clicks;
    this.clicks = [];
    return c;
  }

  /** Test / automation hook: inject relative mouse motion. */
  injectMouse(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }
}
