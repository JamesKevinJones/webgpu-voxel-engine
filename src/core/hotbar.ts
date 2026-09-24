import { BLOCK_TEXTURES, TEXTURE_LAYER, TEXTURE_SIZE, TINTED_LAYERS, texelRgba } from '../gpu/block-textures';
import { BLOCK_NAMES, BlockType } from '../world/block';

/** The nine hotbar blocks, selected with keys 1–9 (or the mouse wheel while walking). */
export const HOTBAR_BLOCKS: readonly number[] = [
  BlockType.Stone, BlockType.Dirt, BlockType.Grass, BlockType.Sand, BlockType.Wood,
  BlockType.Leaves, BlockType.Glass, BlockType.Cobblestone, BlockType.Brick,
];

export class HotbarModel {
  selected = 0;

  get block(): number {
    return HOTBAR_BLOCKS[this.selected]!;
  }

  select(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < HOTBAR_BLOCKS.length) this.selected = index;
  }

  /** Cycles the selection by `delta` slots (wrapping). */
  scroll(delta: number): void {
    const n = HOTBAR_BLOCKS.length;
    this.selected = (((this.selected + delta) % n) + n) % n;
  }

  /** Slot index for a keyboard code (`Digit1` … `Digit9`), or -1. */
  static slotForKey(code: string): number {
    const m = /^Digit([1-9])$/.exec(code);
    return m ? Number(m[1]) - 1 : -1;
  }
}

/** A default plains tint for icons of tinted textures (sRGB-ish multiplier). */
const ICON_TINT = [0.55, 0.85, 0.4];

/** Renders a block's texture (side face, top face for tinted blocks) into a data URL icon. */
function blockIcon(block: number): string {
  const [top, side] = BLOCK_TEXTURES[block]!;
  const name = TINTED_LAYERS[top] === 'full' ? top : side;
  const layer = TEXTURE_LAYER[name];
  const tint = TINTED_LAYERS[name] === 'full';
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const [r, g, b, a] = texelRgba(layer, x, y);
      const o = (y * TEXTURE_SIZE + x) * 4;
      const k = tint ? ICON_TINT : [1, 1, 1];
      img.data[o] = r * k[0]! * 255;
      img.data[o + 1] = g * k[1]! * 255;
      img.data[o + 2] = b * k[2]! * 255;
      img.data[o + 3] = name === 'glass' ? Math.max(a * 255, 40) : name === 'grass_side' ? 255 : a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** DOM hotbar: nine slots with pixel-art icons, the active slot highlighted. */
export class HotbarView {
  private readonly slots: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private shown = -1;

  constructor(root: HTMLElement, private readonly model: HotbarModel) {
    root.classList.add('hotbar');
    HOTBAR_BLOCKS.forEach((block, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.title = BLOCK_NAMES[block]!;
      const icon = document.createElement('img');
      icon.src = blockIcon(block);
      icon.alt = BLOCK_NAMES[block]!;
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = String(i + 1);
      slot.append(icon, key);
      root.append(slot);
      this.slots.push(slot);
    });
    this.label = document.createElement('div');
    this.label.className = 'hotbar-label';
    root.append(this.label);
    this.update();
  }

  update(): void {
    if (this.shown === this.model.selected) return;
    this.shown = this.model.selected;
    this.slots.forEach((s, i) => s.classList.toggle('active', i === this.model.selected));
    this.label.textContent = BLOCK_NAMES[this.model.block]!;
  }
}
