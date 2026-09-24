import { BLOCK_TEXTURES, TEXTURE_LAYER, TEXTURE_SIZE, TINTED_LAYERS, texelRgba, type TextureName } from '../gpu/block-textures';
import { BLOCK_NAMES, BlockType, isCrossPlant } from '../world/block';

/** The nine hotbar items, selected with keys 1–9 or the mouse wheel. */
export const HOTBAR_BLOCKS: readonly number[] = [
  BlockType.Stone, BlockType.Dirt, BlockType.Grass, BlockType.Sand, BlockType.Wood,
  BlockType.Glass, BlockType.Brick, BlockType.Torch, BlockType.Water,
];

/** Starting stack sizes (same order as HOTBAR_BLOCKS). */
export const START_COUNTS: readonly number[] = [64, 64, 32, 64, 64, 32, 64, 32, 16];
export const MAX_STACK = 999;

/** Display names of hotbar items (water is carried in a bucket). */
export function itemName(block: number): string {
  return block === BlockType.Water ? 'Water Bucket' : BLOCK_NAMES[block] ?? '?';
}

/** What mining a block puts into the inventory (the hotbar item it counts towards). */
export function dropFor(block: number): number {
  switch (block) {
    case BlockType.BirchWood:
    case BlockType.PineWood:
      return BlockType.Wood;
    case BlockType.Cobblestone:
      return BlockType.Stone;
    case BlockType.Snow:
      return BlockType.Dirt;
    default:
      return block;
  }
}

export interface HotbarSave {
  selected: number;
  counts: number[];
}

/** Selected slot plus a stack count per slot: placing consumes, mining collects. */
export class HotbarModel {
  selected = 0;
  readonly counts: number[] = [...START_COUNTS];

  get block(): number {
    return HOTBAR_BLOCKS[this.selected]!;
  }

  get count(): number {
    return this.counts[this.selected]!;
  }

  select(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < HOTBAR_BLOCKS.length) this.selected = index;
  }

  /** Cycles the selection by `delta` slots (wrapping). */
  scroll(delta: number): void {
    const n = HOTBAR_BLOCKS.length;
    this.selected = (((this.selected + delta) % n) + n) % n;
  }

  /** Removes one item from the selected stack; false when it is empty. */
  consume(): boolean {
    if (this.counts[this.selected]! <= 0) return false;
    this.counts[this.selected]!--;
    return true;
  }

  /** Adds the drop of a mined block to its stack. Returns the slot, or -1 if it is not a hotbar item. */
  collect(block: number): number {
    const slot = HOTBAR_BLOCKS.indexOf(dropFor(block));
    if (slot >= 0) this.counts[slot] = Math.min(MAX_STACK, this.counts[slot]! + 1);
    return slot;
  }

  save(): HotbarSave {
    return { selected: this.selected, counts: [...this.counts] };
  }

  load(save: HotbarSave): void {
    this.select(save.selected);
    save.counts.forEach((c, i) => {
      if (i < this.counts.length && Number.isInteger(c)) this.counts[i] = Math.max(0, Math.min(MAX_STACK, c));
    });
  }

  /** Slot index for a keyboard code (`Digit1` … `Digit9`), or -1. */
  static slotForKey(code: string): number {
    const m = /^Digit([1-9])$/.exec(code);
    return m ? Number(m[1]) - 1 : -1;
  }
}

/** A default plains tint for icons of tinted textures (sRGB-ish multiplier). */
const ICON_TINT = [0.55, 0.85, 0.4];
const ICON_SIZE = 48;

function textureCanvas(name: TextureName): HTMLCanvasElement {
  const layer = TEXTURE_LAYER[name];
  const tint = TINTED_LAYERS[name];
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const [r, g, b, a] = texelRgba(layer, x, y);
      const o = (y * TEXTURE_SIZE + x) * 4;
      const k = tint === 'full' || (tint === 'masked' && a > 0.5) ? ICON_TINT : [1, 1, 1];
      img.data[o] = r * k[0]! * 255;
      img.data[o + 1] = g * k[1]! * 255;
      img.data[o + 2] = b * k[2]! * 255;
      img.data[o + 3] = tint === 'masked' ? 255 : name === 'glass' ? Math.max(a * 255, 50) : name === 'water' ? 215 : a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Renders a block as an isometric cube (top + two shaded sides) into a data URL; plants and
 * torches are drawn as flat sprites.
 */
export function blockIcon(block: number): string {
  const [top, side] = BLOCK_TEXTURES[block]!;
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (isCrossPlant(block)) {
    ctx.drawImage(textureCanvas(side), 4, 4, ICON_SIZE - 8, ICON_SIZE - 8);
    return canvas.toDataURL();
  }
  const S = TEXTURE_SIZE;
  const face = (tex: HTMLCanvasElement, o: [number, number], u: [number, number], v: [number, number], shade: number) => {
    ctx.setTransform(u[0] / S, u[1] / S, v[0] / S, v[1] / S, o[0], o[1]);
    ctx.drawImage(tex, 0, 0);
    if (shade > 0) {
      ctx.globalAlpha = shade;
      ctx.fillStyle = '#000';
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  };
  const topTex = textureCanvas(top), sideTex = textureCanvas(side);
  // Cube corners: top face (24,3)-(44,14)-(24,25)-(4,14), sides down to y + 21.
  face(topTex, [4, 14], [20, -11], [20, 11], 0);
  face(sideTex, [4, 14], [20, 11], [0, 21], 0.22);
  face(sideTex, [24, 25], [20, -11], [0, 21], 0.4);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas.toDataURL();
}

/** DOM hotbar: nine slots with block icons and stack counts, the active slot highlighted. */
export class HotbarView {
  private readonly slots: HTMLElement[] = [];
  private readonly countEls: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private shown = '';

  constructor(root: HTMLElement, private model: HotbarModel) {
    root.replaceChildren();
    root.classList.add('hotbar');
    HOTBAR_BLOCKS.forEach((block, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.title = itemName(block);
      const icon = document.createElement('img');
      icon.src = blockIcon(block);
      icon.alt = itemName(block);
      icon.draggable = false;
      const key = document.createElement('span');
      key.className = 'hotbar-key';
      key.textContent = String(i + 1);
      const count = document.createElement('span');
      count.className = 'hotbar-count';
      slot.append(icon, key, count);
      root.append(slot);
      this.slots.push(slot);
      this.countEls.push(count);
    });
    this.label = document.createElement('div');
    this.label.className = 'hotbar-label';
    root.append(this.label);
    this.update();
  }

  /** Points the view at another model (after the engine is recreated). */
  bind(model: HotbarModel): void {
    this.model = model;
    this.shown = '';
    this.update();
  }

  update(): void {
    const state = `${this.model.selected}:${this.model.counts.join(',')}`;
    if (state === this.shown) return;
    this.shown = state;
    this.slots.forEach((s, i) => {
      s.classList.toggle('active', i === this.model.selected);
      s.classList.toggle('empty', this.model.counts[i] === 0);
      this.countEls[i]!.textContent = String(this.model.counts[i]);
    });
    this.label.textContent = `${itemName(this.model.block)} × ${this.model.count}`;
  }
}
