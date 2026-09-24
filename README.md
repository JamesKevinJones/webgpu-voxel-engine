# WebGPU Voxel Engine

A high-throughput, chunk-based voxel engine written in TypeScript and raw WGSL. The GPU does the heavy work in compute shaders: world generation, greedy meshing and particle simulation. Chunks are drawn with one `drawIndexedIndirect` call each, using arguments that the GPU mesher writes itself. The CPU only streams chunks, runs player physics, and keeps a palette-compressed copy of the world for raycasting and edits.

- **Terrain**: climate-driven terrain with four biomes (plains, desert, snowy mountains, dense forest), caves, trees and plants
- **Lighting**: cascaded shadow maps, per-vertex ambient occlusion, a day/night cycle and a two-colour sky
- **Play**: walking mode with swept-AABB collision, mining with crack stages, debris particles, and a 9-slot hotbar
- **Checks**: CPU reference implementations of the GPU algorithms, with automated GPU ↔ CPU parity checks

---

## Contents

- [Quick start](#quick-start)
- [Controls](#controls)
- [Architecture](#architecture)
  - [GPU compute pipelines](#gpu-compute-pipelines)
  - [Lighting and shadows](#lighting-and-shadows)
  - [World generation and climate](#world-generation-and-climate)
  - [Player physics and interaction](#player-physics-and-interaction)
  - [Streaming](#streaming)
- [Performance and VRAM](#performance-and-vram)
- [Testing](#testing)
- [Project layout](#project-layout)

---

## Quick start

Requirements: Node.js ≥ 20.19 and a WebGPU-capable browser (Chrome / Edge 113+, or Safari with WebGPU enabled).

```bash
git clone https://github.com/JamesKevinJones/webgpu-voxel-engine.git
cd webgpu-voxel-engine
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload (including `.wgsl` files) |
| `npm test` | Vitest unit test suite |
| `npm run build` | Strict TypeScript check + production bundle in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run test:gpu` | End-to-end GPU test in headless Chromium (run `npm run build` first; needs Playwright + Chromium) |

URL parameters: `?seed=`, `radius=` (view distance in chunks, default 8), `time=` (start time of day, 0–1, where 0.5 is noon), `daylen=` (seconds per day, 0 freezes the clock), `gen=` / `mesh=` (chunks generated / meshed per frame), and `offscreen=1` (render to an offscreen texture for headless automation).

> `.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 resolver crash ("Cannot read properties of null (reading 'edgesOut')") triggered by Vitest's optional peer dependencies.

## Controls

Click the canvas to capture the mouse (pointer lock).

| Input | Freecam (spectator) | Walking (survival) |
| --- | --- | --- |
| `V` | Switch to walking | Switch to freecam |
| Mouse | Look | Look |
| `W` `A` `S` `D` | Fly | Walk |
| `Space` | Fly up | Jump (swim up in water) |
| `Q` / `C` | Fly down | — |
| `Shift` | Speed boost ×4 | Sprint |
| Mouse wheel | Base fly speed | Cycle hotbar |
| Hold `LMB` | Mine the targeted block | Mine the targeted block |
| `RMB` | Place the hotbar block | Place the hotbar block (never inside the player) |
| `1`–`9` | Select hotbar slot | Select hotbar slot |
| `G` | Toggle shadows | Toggle shadows |
| `T` | Pause / resume time of day | Pause / resume time of day |
| `[` / `]` | Clock −1 h / +1 h | Clock −1 h / +1 h |

Hotbar: Stone · Dirt · Grass · Sand · Oak Log · Leaves · Glass · Cobblestone · Brick. Bedrock can't be broken, and plants break instantly.

The HUD shows:
- FPS and frame time
- movement mode, player state (grounded, airborne, swimming) and time of day
- biome, shadow state, mining progress and live particles
- loaded, queued, meshed and visible chunks
- vertex and triangle counts, GPU slot usage and memory
- camera position, chunk coordinates and the targeted block

## Architecture

### Frame pipeline

```
input → camera / player physics → ChunkManager.updateCenter (stream in/out)
  → upload edited chunks (queue.writeBuffer)
  → worldgen compute        (≤ gen chunks)   → copy slots to staging ─┐
  → gather + mesh compute   (≤ mesh chunks)  → copy counters ────────┤ async mapAsync
  → particle compute                                                  │ → CPU chunk state
  → shadow passes: opaque chunks → 2 cascade layers (depth32float)    │
  → main pass: sky, opaque (front→back), cutout (glass, plants)       │
  → late pass, read-only depth: particles, water (back→front),        │
    crack overlay, target box                                         │
submit (at most 2 frames in flight) ◄────────────────────────────────┘
```

### GPU compute pipelines

**Voxel storage.**
- Chunks are 32³ voxels. On the CPU each is a `PalettedChunk`: a reference-counted palette plus power-of-two bit-packed indices (0/1/2/4/8/16 bits), so an index never straddles a 32-bit word.
- On the GPU, each chunk occupies a slot in one large voxel pool: `[bits, paletteLen, nonAir, 0] [palette × 32] [≤ 8192 words of packed indices]`.
- Worldgen writes 8-bit indices with a 32-entry identity palette. CPU edits upload the compact encoding (as few as 0–4 bits), and every GPU consumer decodes any width.

**World generation** (`worldgen.wgsl`, `climate.wgsl`, `noise.wgsl`).
- One invocation fills one 32-bit word (4 voxels).
- Each 64-invocation workgroup first computes, in workgroup memory, the column heights and biomes of its 32 columns, plus the trees of the 4 tree cells it touches. Every voxel then reads them from shared memory.
- Results are copied back to the CPU once. All-air chunks release their GPU slot.

**Greedy meshing** (`gather.wgsl` + `mesh.wgsl`).
1. *Gather* expands a chunk plus a one-voxel border from its 26 neighbour slots into a dense 34³ byte volume.
2. *Mesh* dispatches one 32-thread workgroup per (slice, face direction, chunk):
   - Phase 1 computes each cell's face key (5-bit block id + four 2-bit corner AO levels from the 26-neighbourhood) and records maximal runs in workgroup memory.
   - Phase 2 merges vertically identical runs into quads.
   - Faces merge only when both block and AO match, so AO interpolation stays exact. Quads are rotated so the shared diagonal joins the brighter corners.
3. Each quad reserves space with `atomicAdd` in one of three per-chunk pools (opaque, water, cutout) and writes 4 packed `u32` vertices (position 6+6+6 bits, face, AO, block). It then atomically adds 6 to that pool's `drawIndexedIndirect` index count.
4. Tall grass and flowers are emitted as two crossed quads each.

**Indirect rendering.**
- Each mesh slot has fixed-capacity regions: 6144 opaque, 1024 water and 2048 cutout quads.
- A slot's indirect records use `baseVertex = slot × capacity`, so the vertex shader recovers the chunk from `vertex_index`, pulls vertices from storage buffers, and a single 16-bit index buffer serves every draw.
- Counters are read back asynchronously. Chunks without geometry free their mesh slot, and overflow is reported in the HUD.

### Lighting and shadows

- **Cascaded shadow maps**: the view depth up to 160 m is split into 2 cascades with the practical scheme (λ = 0.75).
  - Each cascade's frustum slice is wrapped in a bounding sphere, so the orthographic box keeps its size while the camera turns.
  - The box centre is snapped to whole texels in a light-space basis, which stops shimmering.
  - The box extends 120 m towards the light, so off-screen occluders still cast shadows.
- **Shadow rendering**: a depth-only pipeline renders opaque chunk geometry into a 2048² `depth32float` texture array. The terrain shader then:
  - offsets the lookup along the normal by a slope-scaled amount, which prevents acne
  - takes 3×3 PCF samples through a filtering comparison sampler
  - cross-fades between cascades and fades shadows out at the shadow distance
- **Ambient occlusion**: computed per vertex in the mesher from the 26-neighbourhood, baked into the vertex data and interpolated.
- **Shading**:
  - a GGX / Smith / Schlick key light (sun by day, moon by night) plus hemispherical sky ambient
  - exponential height fog that fades into the sky at the streaming edge
  - ACES tonemapping with gamma encoding
- **Day/night cycle**: the sun rotates over a configurable day. The two-colour sky dome shifts from dawn to midday to dusk to a starry night with sun and moon discs.
- **Water** is drawn in a pass that reads the depth buffer:
  - absorption grows with water thickness (clear shallows, deep blue offshore)
  - Fresnel reflection of the sky
  - animated UV waves

### World generation and climate

`src/world/terrain.ts` (the CPU mirror) and the WGSL implement the same functions, and a unit test checks that their numeric constants match.

1. **Climate**: low-frequency continentalness, temperature and humidity noise give smooth biome weights:
   - desert: hot and dry
   - snowy mountains: cold
   - dense forest: wet
   - plains: everything else

   The terrain vertex shader evaluates the same model to tint grass and leaves from a bilinear palette, so colours blend smoothly across biome borders.
2. **Heightmap**: continentalness drives a piecewise-linear spline from ocean shelf to highlands. On top of that come biome-weighted hills, desert dunes, and ridged mountains with rounded crests, all scaled by an erosion field.
3. **Density**: `height − y + detail(y)·simplex3`. The detail amplitude fades with altitude (no rock needles), and its vertical gradient stays below 1, so every column has one surface and nothing floats.
4. **Caves**: worm tunnels where two ridged 3D fields peak, only between Y = −40 and 20 and only well below the surface.
5. **Decoration**:
   - plains and forest: grass over dirt
   - desert: sand over a sandstone band
   - snowy mountains: snow, bare stone peaks, frozen sea (ice)
   - everywhere: sand on beaches, basalt deep down, bedrock at the bottom
6. **Trees**: at most one per 8×8 cell, with the canopy kept inside the cell. Each species grows only on its biome's ground: oak (plains, forest), birch (forest), pine (snow), cactus (desert sand). A tree also needs sky clearance, and no cliff may cut through its canopy.
7. **Plants**: tall grass and flowers on plains and forest grass.

### Player physics and interaction

- **Swept AABB collision** (`src/physics/aabb.ts`): the player box (0.6 × 1.8 m, eyes at 1.6 m) is swept one axis at a time through every voxel layer it crosses. It can't tunnel at any speed, and touching faces don't count as collisions, so the player slides along walls.
- **Player** (`src/physics/player.ts`), integrated at a fixed 120 Hz:
  - gravity is 9.8 × 2.8 m/s², with a 1.25 m jump
  - walking and sprinting speeds with ground and air friction, plus buoyant swimming
  - automatic one-block step-up, with camera smoothing
- **DDA raycasting** (Amanatides & Woo) picks the targeted voxel and face within 8 m.
- **Mining**: holding the left button accumulates progress at a rate set by the block's break time. Progress drives 10 procedurally generated crack stages over the block, together with a wireframe target box.
- **Debris particles**: a broken block emits 16–24 fragments into a 1024-slot ring buffer. A compute shader integrates gravity, floor rebound and lifetime, and an instanced draw renders each fragment as a cube textured with a random piece of the broken block.

### Streaming

`ChunkManager` is plain, unit-tested logic with no GPU calls.
- It covers a cylinder of `radius` chunks (Y −64 to 127) and hands out generation and meshing work nearest-first.
- It meshes a chunk only once its neighbourhood is generated, re-meshes neighbours on arrival or border edits, and drops stale asynchronous results using per-job tokens.
- The CPU runs at most 2 frames ahead of the GPU.

## Performance and VRAM

**Frame rate.** On consumer desktop GPUs, Phase 1–2 builds have been reported locally at **80–130 FPS** at the default view radius of 8. At that radius the scene holds on the order of **2.5–3 M triangles**. The Phase 1 GPU test measured about 2.5 M at radius 8, before biomes and plants existed; the current count depends on terrain. These frame rates are not measured by the automated tests, which run on a software rasteriser. Frame cost scales with view radius: the extra shadow passes re-draw the opaque geometry of every chunk inside each cascade's volume.

**GPU memory.** The pools are allocated once at start-up, sized from the view radius (and clamped to the device's buffer limits). This table was computed with the same sizing code (`fitSlotsToLimits`):

| View radius | Voxel pool | Mesh pools | Shadow maps | Total |
| --- | --- | --- | --- | --- |
| 4 | 21 MB | 58 MB | 32 MB | **≈ 111 MB** |
| 6 | 38 MB | 102 MB | 32 MB | **≈ 172 MB** |
| 8 (default) | 59 MB | 159 MB | 32 MB | **≈ 251 MB** |

Add a few MB for the depth buffer, textures, the 1024 particles and staging buffers. The footprint stays under 160 MB up to about radius 5. The mesh pools dominate because each chunk slot reserves space for its worst case (6144 + 1024 + 2048 quads).

## Testing

**`npm test`** runs 164 Vitest unit tests covering:
- coordinate transforms, bit-packing and palette invariants (including the GPU layout, decoded exactly as the shader does)
- noise determinism, terrain shape, biome invariants, tree placement bounds and species rules
- greedy-mesh invariants on random volumes (exact face coverage, winding, AO diagonals)
- cascade splits and fitting
- AABB sweeps and player physics
- raycasting, streaming, particles, mining and the hotbar
- textures and WGSL consistency: include resolution, generated constants, reserved words, and the uniform layout checked against the WGSL struct

**`npm run test:gpu`** serves the production build in headless Chromium with WebGPU (SwiftShader works without a GPU). It fails on any WGSL or validation error and also checks:
- GPU terrain against the CPU mirror, and GPU mesh quad counts against the CPU mesher, before and after edits and after a four-biome tour
- that walking mode lands on terrain without clipping
- that shadows visibly darken the scene
- that mining produces a 16–24 fragment debris burst

It writes screenshots to `scripts/out/`. Headless Chromium can't present a WebGPU canvas without a display, so the test renders offscreen and captures frames through the debug API (`globalThis.__voxel`).

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build` and `npm test` on every push to `main`.

## Project layout

```
src/
  core/      engine loop, WebGPU context, uniforms, sky model, cascades, hotbar, stats HUD, debug API
  gpu/       GPU pools + compute passes, render pipelines, procedural textures, WGSL prelude, readbacks
  world/     blocks, coordinates, palette storage, terrain + climate + noise, CPU mesher, streaming, raycast
  physics/   swept AABB collision, walking player
  fx/        mining progress, debris particle ring buffer
  camera/    perspective camera, fly controller, input
  math/      zero-allocation vec3 / mat4 / frustum
  shaders/   WGSL: noise, climate, worldgen, gather, mesh, terrain, shadow, sky, overlay, particles, common
tests/       Vitest suites
tools/       Vite WGSL loader (#include expansion)
scripts/     headless GPU smoke test
```

Constants shared by TypeScript and WGSL (buffer layouts, capacities, block ids, render classes, texture layers) are defined once in TypeScript and generated into a WGSL prelude.

## License

MIT, see [LICENSE](LICENSE).
