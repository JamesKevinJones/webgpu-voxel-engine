import { describe, expect, it } from 'vitest';
import { BlockType, isOpaque, isWater } from '../src/world/block';
import { CHUNK_SIZE, localIndex } from '../src/world/coords';
import {
  BEACH_MAX_Y,
  Biome,
  CAVE_MAX_Y,
  CAVE_MIN_DENSITY,
  CAVE_MIN_Y,
  GRASS_MAX_Y,
  PEAK_Y,
  SEA_LEVEL,
  TREE_CELL,
  TREE_RADIUS,
  TreeKind,
  WORLD_MAX_Y,
  WORLD_MIN_Y,
  biomeWeights,
  blockAt,
  climateAt,
  dominantBiome,
  generateChunkDense,
  grassTint,
  isCave,
  surfaceBlock,
  surfaceHeight,
  targetHeight,
  terrainDensity,
  treeInCell,
  type Tree,
} from '../src/world/terrain';

const seed = 1337;
const columns = (n: number, span = 3000): [number, number][] =>
  Array.from({ length: n }, (_, i) => [((i * 7919) % span) - span / 2, ((i * 104729) % span) - span / 2]);

/** First sampled column of each biome (over a wide area). */
const biomeSamples = (() => {
  const found = new Map<Biome, [number, number][]>();
  for (const [x, z] of columns(6000, 16000)) {
    const b = climateAt(x, z, seed).biome;
    const list = found.get(b) ?? [];
    if (list.length < 60) list.push([x, z]);
    found.set(b, list);
  }
  return found;
})();

describe('climate and biomes', () => {
  it('produces non-negative biome weights that sum to one', () => {
    for (let t = -1; t <= 1; t += 0.05) {
      for (let h = -1; h <= 1; h += 0.05) {
        const w = biomeWeights(t, h);
        for (const v of w) expect(v).toBeGreaterThanOrEqual(0);
        expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      }
    }
  });

  it('maps climate corners to the expected biomes', () => {
    expect(dominantBiome(biomeWeights(0.5, -0.5))).toBe(Biome.Desert);
    expect(dominantBiome(biomeWeights(-0.5, 0))).toBe(Biome.SnowyMountains);
    expect(dominantBiome(biomeWeights(-0.5, 0.5))).toBe(Biome.SnowyMountains);
    expect(dominantBiome(biomeWeights(0, 0.5))).toBe(Biome.Forest);
    expect(dominantBiome(biomeWeights(0, -0.02))).toBe(Biome.Plains);
    expect(dominantBiome(biomeWeights(0.5, 0.5))).toBe(Biome.Forest);
  });

  it('generates all four biomes in large coherent regions', () => {
    for (const b of Object.values(Biome)) expect(biomeSamples.get(b)?.length, `biome ${b}`).toBeGreaterThan(20);
    // Neighbouring columns almost always share a biome (regions, not noise).
    let same = 0;
    for (const [x, z] of columns(500)) if (climateAt(x, z, seed).biome === climateAt(x + 1, z, seed).biome) same++;
    expect(same).toBeGreaterThan(490);
  });

  it('blends grass tints smoothly with a darker dense forest palette', () => {
    for (const [x, z] of columns(300)) {
      const a = climateAt(x, z, seed), b = climateAt(x + 1, z, seed);
      const ta = grassTint(a.temperature, a.humidity), tb = grassTint(b.temperature, b.humidity);
      for (let k = 0; k < 3; k++) {
        expect(ta[k]).toBeGreaterThan(0);
        expect(ta[k]).toBeLessThan(1);
        expect(Math.abs(ta[k]! - tb[k]!)).toBeLessThan(0.02); // ≤ 2 % per block: no visible seams
      }
    }
    const lum = (c: number[]) => c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
    expect(lum(grassTint(0, 0.5))).toBeLessThan(lum(grassTint(0, -0.02)));
    expect(grassTint(0.6, -0.6)[0]).toBeGreaterThan(grassTint(0.6, 0.6)[0]); // dry = yellower
  });
});

describe('terrain shape', () => {
  it('generates identical chunks for identical seeds and different ones otherwise', () => {
    const a = generateChunkDense(1, 0, -1, seed);
    expect(a).toEqual(generateChunkDense(1, 0, -1, seed));
    expect(a).not.toEqual(generateChunkDense(1, 0, -1, seed + 1));
  });

  it('is seamless across chunk borders (pure function of world position)', () => {
    const left = generateChunkDense(-1, 0, 0, 5);
    const right = generateChunkDense(0, 0, 0, 5);
    for (let y = 0; y < CHUNK_SIZE; y += 3) {
      for (let z = 0; z < CHUNK_SIZE; z += 2) {
        expect(left[localIndex(31, y, z)]).toBe(blockAt(-1, y, z, 5));
        expect(right[localIndex(0, y, z)]).toBe(blockAt(0, y, z, 5));
      }
    }
  });

  it('has density strictly decreasing with height (no floating terrain)', () => {
    let minStep = Infinity;
    for (const [x, z] of columns(800)) {
      const t = targetHeight(x, z, seed);
      for (let y = WORLD_MIN_Y; y < WORLD_MAX_Y; y += 2) {
        minStep = Math.min(minStep, terrainDensity(x, y, z, t, seed) - terrainDensity(x, y + 1, z, t, seed));
      }
    }
    expect(minStep).toBeGreaterThan(0.1);
  });

  it('has no rock needles or monoliths, even on the highest mountains', () => {
    // Find the tallest sampled terrain and scan a window around it.
    let peak: [number, number] = [0, 0], best = -Infinity;
    for (const [x, z] of columns(3000, 6000)) {
      const h = targetHeight(x, z, seed);
      if (h > best) { best = h; peak = [x, z]; }
    }
    expect(best).toBeGreaterThan(45);
    const N = 48, h: number[] = [];
    for (let dz = 0; dz < N; dz++) for (let dx = 0; dx < N; dx++) h.push(surfaceHeight(peak[0] - N / 2 + dx, peak[1] - N / 2 + dz, seed));
    let worst = 0;
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const around = Math.max(h[z * N + x - 1]!, h[z * N + x + 1]!, h[(z - 1) * N + x]!, h[(z + 1) * N + x]!);
        worst = Math.max(worst, h[z * N + x]! - around);
      }
    }
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('keeps only air, water, ice, trees and plants above the surface', () => {
    const allowed: number[] = [BlockType.Air, BlockType.Water, BlockType.Ice, BlockType.Wood, BlockType.Leaves,
      BlockType.BirchWood, BlockType.PineWood, BlockType.PineLeaves, BlockType.Cactus, BlockType.TallGrass,
      BlockType.RedFlower, BlockType.YellowFlower];
    for (const [x, z] of columns(120)) {
      const s = surfaceHeight(x, z, seed);
      for (let y = s + 1; y < s + 12; y++) {
        const b = blockAt(x, y, z, seed);
        expect(allowed).toContain(b);
        if (b === BlockType.Water || b === BlockType.Ice) expect(y).toBeLessThanOrEqual(SEA_LEVEL);
      }
      expect(isOpaque(blockAt(x, s, z, seed))).toBe(true);
    }
  });

  it('carves caves only inside their height band and well below the surface', () => {
    let caves = 0;
    for (const [x, z] of columns(60)) {
      const t = targetHeight(x, z, seed);
      for (let y = WORLD_MIN_Y; y < 60; y++) {
        const d = terrainDensity(x, y, z, t, seed);
        if (isCave(x, y, z, d, seed)) {
          caves++;
          expect(y).toBeGreaterThanOrEqual(CAVE_MIN_Y);
          expect(y).toBeLessThanOrEqual(CAVE_MAX_Y);
          expect(d).toBeGreaterThan(CAVE_MIN_DENSITY);
          expect(blockAt(x, y, z, seed)).toBe(BlockType.Air);
        }
      }
    }
    expect(caves).toBeGreaterThan(0);
  });

  it('lays bedrock at the bottom of the world', () => {
    for (const [x, z] of columns(100)) {
      expect(blockAt(x, WORLD_MIN_Y, z, seed)).toBe(BlockType.Bedrock);
      expect(blockAt(x, WORLD_MIN_Y + 3, z, seed)).not.toBe(BlockType.Bedrock);
    }
  });
});

describe('biome surfaces', () => {
  const surfaceColumns = (b: Biome) => (biomeSamples.get(b) ?? []).map(([x, z]) => ({ x, z, s: surfaceHeight(x, z, seed) }));

  it('uses the biome surface block on top of every column', () => {
    for (const b of Object.values(Biome)) {
      for (const { x, z, s } of surfaceColumns(b)) expect(blockAt(x, s, z, seed)).toBe(surfaceBlock(s, b));
    }
  });

  it('plains and forests: grass over 3 dirt over stone, sand on beaches', () => {
    for (const b of [Biome.Plains, Biome.Forest]) {
      for (const { x, z, s } of surfaceColumns(b)) {
        if (s <= BEACH_MAX_Y || s > GRASS_MAX_Y) continue;
        expect(blockAt(x, s, z, seed)).toBe(BlockType.Grass);
        for (const d of [1, 2, 3]) {
          const layer = s - d <= BEACH_MAX_Y ? BlockType.Sand : BlockType.Dirt;
          expect([layer, BlockType.Air]).toContain(blockAt(x, s - d, z, seed));
        }
      }
    }
  });

  it('deserts: sand surface with a sandstone band beneath', () => {
    let sandstone = 0;
    for (const { x, z, s } of surfaceColumns(Biome.Desert)) {
      expect(blockAt(x, s, z, seed)).toBe(BlockType.Sand);
      expect(blockAt(x, s - 2, z, seed)).toBe(BlockType.Sand);
      if (blockAt(x, s - 6, z, seed) === BlockType.Sandstone) sandstone++;
    }
    expect(sandstone).toBeGreaterThan(40);
  });

  it('snowy mountains: snow cover, exposed stone peaks and frozen water', () => {
    const cols = surfaceColumns(Biome.SnowyMountains);
    for (const { x, z, s } of cols) {
      expect(blockAt(x, s, z, seed)).toBe(s > PEAK_Y ? BlockType.Stone : BlockType.Snow);
      if (s < SEA_LEVEL) expect(blockAt(x, SEA_LEVEL, z, seed)).toBe(BlockType.Ice);
    }
    expect(cols.some(({ s }) => s < SEA_LEVEL)).toBe(true);
  });
});

describe('trees and plants', () => {
  const trees: Tree[] = [];
  const perBiome = new Map<Biome, { cells: number; trees: number }>();
  for (let cx = -60; cx < 60; cx += 2) {
    for (let cz = -60; cz < 60; cz += 2) {
      const t = treeInCell(cx * 7, cz * 5, seed);
      const b = climateAt(cx * 7 * TREE_CELL + 4, cz * 5 * TREE_CELL + 4, seed).biome;
      const stat = perBiome.get(b) ?? { cells: 0, trees: 0 };
      stat.cells++;
      if (t) { trees.push(t); stat.trees++; }
      perBiome.set(b, stat);
    }
  }

  it('keeps every tree and canopy inside its cell', () => {
    expect(trees.length).toBeGreaterThan(100);
    for (const t of trees) {
      const cellX = Math.floor(t.x / TREE_CELL), cellZ = Math.floor(t.z / TREE_CELL);
      expect(t.x - TREE_RADIUS).toBeGreaterThanOrEqual(cellX * TREE_CELL);
      expect(t.x + TREE_RADIUS).toBeLessThan((cellX + 1) * TREE_CELL);
      expect(t.z - TREE_RADIUS).toBeGreaterThanOrEqual(cellZ * TREE_CELL);
      expect(t.z + TREE_RADIUS).toBeLessThan((cellZ + 1) * TREE_CELL);
      expect(t.top + 3).toBeLessThanOrEqual(WORLD_MAX_Y);
    }
  });

  it('grows each species only on its biome ground, with sky clearance', () => {
    const ground = { [TreeKind.Oak]: BlockType.Grass, [TreeKind.Birch]: BlockType.Grass, [TreeKind.Pine]: BlockType.Snow, [TreeKind.Cactus]: BlockType.Sand };
    const trunk = { [TreeKind.Oak]: BlockType.Wood, [TreeKind.Birch]: BlockType.BirchWood, [TreeKind.Pine]: BlockType.PineWood, [TreeKind.Cactus]: BlockType.Cactus };
    const kinds = new Set<number>();
    for (const t of trees) {
      kinds.add(t.kind);
      expect(blockAt(t.x, t.base, t.z, seed)).toBe(ground[t.kind]);
      for (let y = t.base + 1; y <= t.top; y++) expect(blockAt(t.x, y, t.z, seed)).toBe(trunk[t.kind]);
      if (t.kind !== TreeKind.Cactus) {
        expect([BlockType.Leaves, BlockType.PineLeaves]).toContain(blockAt(t.x, t.top + 1, t.z, seed));
      }
      // Clearance: no neighbouring terrain rises into the canopy.
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        expect(surfaceHeight(t.x + dx!, t.z + dz!, seed)).toBeLessThanOrEqual(t.base + 2);
      }
      const biome = climateAt(t.x, t.z, seed).biome;
      if (t.kind === TreeKind.Cactus) expect(biome).toBe(Biome.Desert);
      if (t.kind === TreeKind.Pine) expect(biome).toBe(Biome.SnowyMountains);
      if (t.kind === TreeKind.Birch) expect(biome).toBe(Biome.Forest);
    }
    expect(kinds.size).toBe(4);
  });

  it('has biome-dependent tree density (dense forest ≫ plains)', () => {
    const rate = (b: Biome) => perBiome.get(b)!.trees / perBiome.get(b)!.cells;
    expect(rate(Biome.Forest)).toBeGreaterThan(rate(Biome.Plains) * 3);
  });

  it('places tall grass and flowers only directly on grass', () => {
    let plants = 0;
    for (const [x, z] of columns(3000, 4000)) {
      const s = surfaceHeight(x, z, seed);
      const b = blockAt(x, s + 1, z, seed);
      if (b === BlockType.TallGrass || b === BlockType.RedFlower || b === BlockType.YellowFlower) {
        plants++;
        expect(blockAt(x, s, z, seed)).toBe(BlockType.Grass);
        expect(s + 1).toBeGreaterThan(SEA_LEVEL);
      }
    }
    expect(plants).toBeGreaterThan(50);
  });

  it('produces every natural block type somewhere', () => {
    const seen = new Set<number>();
    const add = (x: number, y: number, z: number) => seen.add(blockAt(x, y, z, seed));
    for (const t of trees) for (let y = t.base; y <= t.top + 1; y++) add(t.x, y, t.z);
    for (const list of biomeSamples.values()) {
      for (const [x, z] of list) {
        const s = surfaceHeight(x, z, seed);
        for (const d of [-1, 0, 1, 2, 6, 20, 50]) add(x, s - d, z);
        add(x, SEA_LEVEL, z);
        add(x, WORLD_MIN_Y, z);
      }
    }
    for (const [x, z] of columns(3000, 4000)) add(x, surfaceHeight(x, z, seed) + 1, z);
    // Crafted blocks and dynamic water (flowing / falling only appears through the fluid simulation).
    const natural = Object.values(BlockType).filter((b) => b !== BlockType.Glass && b !== BlockType.Cobblestone && b !== BlockType.Brick &&
      b !== BlockType.Torch && (b === BlockType.Water || !isWater(b)));
    for (const b of natural) expect(seen.has(b), `block ${b}`).toBe(true);
  });
});
