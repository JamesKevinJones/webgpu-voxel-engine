# Voxel Frontier — a WebGPU voxel engine

**Play it:** <https://jameskevinjones.github.io/webgpu-voxel-engine/> (needs a WebGPU browser: Chrome / Edge 113+, or Safari 26)

A chunk-based voxel sandbox written in TypeScript and raw WGSL, with no runtime dependencies. The GPU does the heavy work in compute shaders: world generation, greedy meshing and particle simulation. Chunks are drawn with one `drawIndexedIndirect` call each, using arguments that the GPU mesher writes itself. The CPU streams chunks, floods voxel light, runs the water automaton and player physics, and keeps a palette-compressed copy of the world for raycasting, edits and saving.

- **Terrain**: climate-driven terrain with four biomes (plains, desert, snowy mountains, dense forest), caves, trees and plants
- **Lighting**: dual-channel flood-fill voxel light (sunlight + torches) with smooth per-vertex interpolation, cascaded shadow maps, ambient occlusion, a day/night cycle
- **Water**: cellular-automaton flowing water (down first, then up to 7 blocks sideways) with lowered flow surfaces
- **Game**: title screen, pause menu with settings, walking physics, mining with crack stages, debris particles, a 9-slot inventory hotbar with torches and a water bucket
- **Persistence and sound**: player edits saved to IndexedDB as sparse chunk diffs (auto-save every 30 s); all sound effects synthesized live with the Web Audio API, no audio files
- **Checks**: CPU reference implementations of the GPU algorithms, with automated GPU ↔ CPU parity checks, 215 unit tests and a headless end-to-end GPU test

---

## Contents

- [Quick start](#quick-start)
- [Controls](#controls)
- [Architecture](#architecture)
  - [GPU compute pipelines](#gpu-compute-pipelines)
  - [Voxel lighting](#voxel-lighting)
  - [Lighting and shadows](#lighting-and-shadows)
  - [Flowing water](#flowing-water)
  - [World generation and climate](#world-generation-and-climate)
  - [Player physics and interaction](#player-physics-and-interaction)
  - [Saving and sound](#saving-and-sound)
  - [Game shell](#game-shell)
  - [Streaming](#streaming)
- [Performance and VRAM](#performance-and-vram)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project layout](#project-layout)

---

## Quick start

Requirements: Node.js ≥ 20.19 and a WebGPU-capable browser (Chrome / Edge 113+, or Safari 26).

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

URL parameters (all optional): `?seed=`, `radius=` (view distance in chunks; overrides the setting), `time=` (start time of day, 0–1, where 0.5 is noon), `daylen=` (seconds per day, 0 freezes the clock), `gen=` / `mesh=` (chunks generated / meshed per frame), `autostart=1` (skip the title screen), and `offscreen=1` (render to an offscreen texture for headless automation; implies `autostart` unless `autostart=0`).

> `.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 resolver crash ("Cannot read properties of null (reading 'edgesOut')") triggered by Vitest's optional peer dependencies.

## Controls

Pick a seed on the title screen (a number or any text) and press **Click to Play**, which captures the mouse. `Esc` releases it and opens the pause menu. New worlds start in walking mode.

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
| `RMB` | Place the hotbar item | Place the hotbar item (never inside the player) |
| `1`–`9` | Select hotbar slot | Select hotbar slot |
| `G` | Toggle shadows | Toggle shadows |
| `T` | Pause / resume time of day | Pause / resume time of day |
| `[` / `]` | Clock −1 h / +1 h | Clock −1 h / +1 h |
| `F3` | Debug overlay | Debug overlay |
| `Esc` | Pause menu | Pause menu |

Hotbar: Stone · Dirt · Grass · Sand · Oak Log · Glass · Brick · Torch · Water Bucket. Each slot has a stack count: placing uses one item, and mining a block adds its drop to the matching slot (birch and pine logs count as oak logs, cobblestone as stone). Bedrock can't be broken; plants and torches break instantly.

The **F3 overlay** shows FPS, frame time, active chunks, triangle count, XYZ position and biome, plus the voxel light at the camera, streaming queues (generation, lighting, meshing), GPU slot usage and memory, the targeted block, mining progress, particles, and the number of saved edits and water cells being simulated.

## Architecture

### Frame pipeline

```
input → camera / player physics → mining / placing → water automaton step (every 0.25 s)
  → ChunkManager.updateCenter (stream in/out)
  → initial lighting of streamed chunks (≤ 6 ms of CPU per frame)
  → upload edited chunks (queue.writeBuffer)
  → worldgen compute        (≤ gen chunks)   → copy slots to staging ─┐
  → gather + mesh compute   (≤ mesh chunks,  → copy counters ────────┤ async mapAsync
      + CPU-built 34³ light volume per job)                           │
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
   - Phase 1 computes each cell's two-word face key and records maximal runs in workgroup memory (`array<vec2<u32>, 1024>`, 8 KiB). Word 1 is the 5-bit block id plus four 2-bit corner AO levels from the 26-neighbourhood. Word 2 holds four smoothed corner light bytes (see [Voxel lighting](#voxel-lighting)).
   - Phase 2 merges vertically identical runs into quads.
   - Faces merge only when block, AO and light all match, so interpolation stays exact. Quads are rotated so the shared diagonal joins the brighter AO corners.
3. Each quad reserves space with `atomicAdd` in one of three per-chunk pools (opaque, water, cutout) and writes 4 packed `u32` vertices (position 6+6+6 bits, face, AO, 5-bit block id) plus one light word per quad, stored after the pool's vertex region. It then atomically adds 6 to that pool's `drawIndexedIndirect` index count.
4. Tall grass, flowers and torches are emitted as two crossed quads each.

**Indirect rendering.**
- Each mesh slot has fixed-capacity regions: 6144 opaque, 1024 water and 2048 cutout quads.
- A slot's indirect records use `baseVertex = slot × capacity`, so the vertex shader recovers the chunk from `vertex_index`, pulls vertices from storage buffers, and a single 16-bit index buffer serves every draw.
- Counters are read back asynchronously. Chunks without geometry free their mesh slot, and overflow is reported in the HUD.

### Voxel lighting

`src/world/lighting.ts` stores one byte per voxel: 4-bit skylight (high nibble) and 4-bit block light (low nibble).

- **Propagation** is a breadth-first flood fill on the CPU with one queue per channel. Light loses one level per step, plus the block's extra attenuation: 1 more for leaves, while water only breaks the sunbeam rule. Opaque blocks stop it.
- **Sunlight**: skylight 15 travels straight down through fully transparent blocks without loss, so open sky lights every column down to the first opaque block. From there it spreads sideways into overhangs and cave mouths at −1 per block. A freshly generated chunk takes its sunbeams from the chunk above (generation runs top-down within each column, so that chunk is already lit), fills them column by column, and floods only from where beams stop or from beside shorter beams. Then it exchanges light with every lit neighbour across its six faces.
- **Torches** emit block light 14.
- **Removal** (placing a block into light, or mining a torch) uses the two-queue scheme. A removal flood clears every level that depended on the removed light (including whole 15-sunbeams below a new roof) and collects the brighter voxels at its border, which are then re-flooded. Edits relight across chunk borders, and every chunk whose padded volume saw a change is queued for remeshing.
- **Memory**: a chunk's light stays a single uniform value until some voxel differs, so open sky and solid rock cost nothing. On generated terrain only about a quarter of the chunks need their 32 KiB array.
- **Budget**: initial lighting costs about 0.8 ms per chunk and runs under a 6 ms per-frame budget. Meshing waits until a chunk and its neighbours are lit.
- **GPU hand-off**: for each mesh job the CPU copies the chunk's light and a one-voxel border into a 34³ byte volume (row copies from the neighbours) and uploads it next to the gathered block volume. The mesher averages the transparent voxels around each face corner, the same neighbourhood as the AO, into smooth per-vertex sky and block light.
- **Shading**: skylight scales the hemispherical sky ambient quadratically, so caves fall off into darkness. Skylight also gates the direct sun, so enclosed spaces never receive sunlight even beyond the shadow-map range, while the cascaded shadow maps give the sharp shadows outdoors. Block light adds a warm torch colour, and torch flames are emissive.

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
  - Fresnel reflection of the sky, dimmed by skylight (so cave pools don't mirror the sky)
  - animated UV waves

### Flowing water

`src/world/fluids.ts` is a cellular automaton over dirty cells, Minecraft-style.

- **Blocks**: sources (`Water`, including all generated water) never change. Flowing water uses 7 block ids for levels 1–7, and a separate *falling water* id marks full-height waterfall columns. Together with the torch, that gives exactly the 32 block ids the 5-bit vertex field can hold.
- **Rules**: a cell with water above becomes falling water (downward flow always wins). Otherwise it takes the lowest level among horizontal water neighbours that can spread sideways, plus one, up to 7. With no such neighbour it dries up. A neighbour spreads sideways only when it cannot flow down: the block below stops water, or it is a source resting on a source. So a waterfall landing in a lake doesn't spill over the surface, but digging out a lake shore floods the hole.
- **Updates**: every 0.25 s the automaton evaluates up to 4096 scheduled cells: it computes all new states first, then applies them, so the result doesn't depend on order. Each change schedules its neighbours for the next step. Breaking or placing any block schedules the cell and its six neighbours. Changes go through the same edit path as the player, so they relight, remesh only the affected chunks (plus border neighbours) on the GPU, and are saved.
- **Rendering**: the vertex shader lowers the top edge of flowing water by its level. The mesher draws the side step between higher and lower water, and the lowered top under a solid block.

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

### Saving and sound

- **Delta storage** (`src/storage/`): terrain is deterministic from the seed, so only differences are saved. `WorldDelta` records the final block of every edited voxel per chunk: player edits, and the water they release.
  - Each dirty chunk is encoded as a compact binary record: `"VD"`, a version byte, a count, then `u16` voxel indices followed by `u8` block ids.
  - Records are written to IndexedDB through a zero-dependency wrapper (`IndexedDbStore`) under `w<seed>/c/<cx,cy,cz>`. The player (position, view, mode, time of day, hotbar stacks) goes under `w<seed>/player`.
  - When a chunk streams in, its saved edits are applied to the generated voxels before lighting, and the chunk is re-uploaded to its GPU slot.
  - The game auto-saves every 30 s with a toast, and also saves on pause, quitting to the title, tab hide and page hide.
  - **Reset World** in the pause menu wipes the local database and regenerates the world. If IndexedDB is unavailable (some private-browsing modes), the game still runs and says that saving is unavailable.
- **Procedural audio** (`src/audio/sound.ts`): every sound is synthesized with the Web Audio API from white-noise bursts through biquad filters, plus oscillator sweeps, randomised slightly per call.
  - Footsteps are filtered by the ground material: sharp bandpassed clicks with a thump on stone, soft low-passed steps on grass and dirt, granular crunches on sand and snow, hollow knocks on wood.
  - Block breaking is a crunch: a train of bursts with a downward filter sweep and a low thud (glass shatters instead).
  - Placing is a pop: a quick downward sine sweep with a click.
  - Water gives splashes when entering it and on swim strokes: a sweeping low-pass wash with rising bubble chirps.
  - The audio context starts on the first click, as browsers require. A compressor on the master bus prevents clipping, and a volume slider sits in the pause menu.

### Game shell

`src/ui/game.ts` wraps the engine:

- **Title screen**: title, seed field (a number or any text, which is hashed), random-seed button, **Click to Play**, a loading bar and a controls cheat-sheet. The live world renders behind it with a slowly panning camera.
- **Play**: pointer lock is requested from the Play click itself (browsers require a user gesture). Losing it (`Esc`) pauses.
- **Pause menu**:
  - Resume, the world seed, and when the world was last saved
  - volume
  - field of view (60–110°), render distance (4–14 chunks), fog density, and a shadows toggle
  - Save & quit to title, and a two-click **Reset World**

  Settings apply live, persist per browser, and a changed render distance applies on resume. The engine is rebuilt on the same GPU device around the current player and edits, because the GPU pools are sized from the radius.
- **HUD**: crosshair, hotbar with isometric block icons (drawn from the procedural textures), stack counts and the active slot raised, a toast area, and the F3 overlay.

### Streaming

`ChunkManager` is plain, unit-tested logic with no GPU calls.
- It covers a cylinder of `radius` chunks (Y −64 to 127). It hands out generation work column by column, nearest first and top-down within a column (so sunlight arrives from above), and meshing work nearest-first.
- It applies saved edits to freshly generated chunks, queues them for lighting, and meshes a chunk only once its neighbourhood is generated and lit. It re-meshes neighbours on arrival, border edits or light changes, and drops stale asynchronous results using per-job tokens.
- The CPU runs at most 2 frames ahead of the GPU.

## Performance and VRAM

**Frame rate.** On consumer desktop GPUs, Phase 1–2 builds have been reported locally at **80–130 FPS** at the default view radius of 8. At that radius the scene holds on the order of **2.5–3 M triangles**. The Phase 1 GPU test measured about 2.5 M at radius 8, before biomes and plants existed; the current count depends on terrain. These frame rates are not measured by the automated tests, which run on a software rasteriser. Frame cost scales with view radius: the extra shadow passes re-draw the opaque geometry of every chunk inside each cascade's volume.

**GPU memory.** The pools are allocated when a world starts, sized from the view radius (and clamped to the device's buffer limits). This table was computed with the same sizing code (`fitSlotsToLimits`, sizes in MiB). The mesh pools include one light word per quad.

| View radius | Voxel pool | Mesh pools | Shadow maps | Total |
| --- | --- | --- | --- | --- |
| 4 | 21 MB | 72 MB | 32 MB | **≈ 126 MB** |
| 6 | 38 MB | 128 MB | 32 MB | **≈ 198 MB** |
| 8 (default) | 59 MB | 199 MB | 32 MB | **≈ 291 MB** |
| 14 (max setting) | 152 MB | 509 MB | 32 MB | **≈ 693 MB** |

Add a few MB for the depth buffer, textures, the 1024 particles, the per-job light volumes and staging buffers. The mesh pools dominate because each chunk slot reserves space for its worst case (6144 + 1024 + 2048 quads). At large radii the pools can exceed a device's `maxBufferSize`. The pools are then clamped, and the farthest chunks (already deep in the fog) stay unmeshed.

**CPU memory.** Chunk voxels are palette-compressed. Light arrays (32 KiB) exist only for chunks whose light isn't uniform, which is roughly a quarter of generated chunks.

## Testing

**`npm test`** runs 215 Vitest unit tests covering:
- **BFS lighting**: sunbeams and sideways attenuation, water and leaf attenuation, sealing a cave, torch falloff and removal, overlapping torches, walls, propagation across chunk borders in both generation orders, padded light volumes, the chunk manager's light gating, remesh set and time budget
- **Water flow**: exactly 7 levels on flat ground (the Manhattan diamond), downward priority off a ledge, drying up after the source is removed, no spill over a lake surface, flooding a dug shore, washing away plants, bounded work per step, and the tick clock
- **Delta storage**: binary round-trips (including thousands of random edits), corrupt / truncated / future-version records, dirty tracking, save/load/reset through `WorldStore` with an in-memory backend, separate seeds, failed-save retry, and re-applying edits to streamed chunks
- **Audio**: material mapping, gesture unlock, valid parameter ramps for every effect (checked against a strict fake `AudioContext`), and volume
- **Settings and hotbar**: clamping, storage failures, seed parsing, stack counts, drops, and save/restore
- coordinate transforms, bit-packing and palette invariants (including the GPU layout, decoded exactly as the shader does)
- noise determinism, terrain shape, biome invariants, tree placement bounds and species rules
- greedy-mesh invariants on random volumes (exact face coverage, winding, AO diagonals), light-aware merging and smoothing, and flowing-water faces
- cascade splits and fitting, AABB sweeps and player physics, raycasting, streaming, particles and mining
- textures and WGSL consistency: include resolution, generated constants, reserved words, binding and workgroup-memory limits, and the uniform layout checked against the WGSL struct

**`npm run test:gpu`** serves the production build in headless Chromium with WebGPU (SwiftShader works without a GPU). It fails on any WGSL or validation error and also checks:
- GPU terrain against the CPU mirror, and GPU mesh quad counts (with lighting) against the CPU mesher, before and after edits, torches and water flow, and after a four-biome tour
- that walking mode lands on terrain without clipping
- that shadows visibly darken the scene
- that mining produces a 16–24 fragment debris burst
- skylight outdoors and darkness in sealed rock, and that a torch placed in a dark room gives light 14 / 13 / 9 at distance 0 / 1 / 5 and visibly brightens the rendered frame
- that a poured water source spreads
- that edits, torch light and the player position survive a save to IndexedDB and a page reload
- the title screen, Play, the F3 overlay, the HUD, pausing on pointer-lock release, and that Reset World erases the local database

It writes screenshots to `scripts/out/`. Headless Chromium can't present a WebGPU canvas without a display, so the test renders offscreen and captures frames through the debug API (`globalThis.__voxel`).

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build` and `npm test` on every push to `main`.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, `npm test` and `npm run build`, then it publishes `dist/` to the `gh-pages` branch. `vite.config.ts` sets `base: './'`, so every asset URL is relative and the build works under the `/<repo>/` sub-path of GitHub Pages (or any other static host).

One-time setup: in the repository settings, under **Pages**, set the source to **Deploy from a branch**, `gh-pages`, `/ (root)`. After that, every push to `main` redeploys the site.

## Project layout

```
src/
  ui/        game shell: title / pause / settings / HUD / toasts / auto-save, settings storage
  core/      engine loop, WebGPU context, uniforms, sky model, cascades, hotbar inventory, F3 overlay, debug API
  gpu/       GPU pools + compute passes, render pipelines, procedural textures, WGSL prelude, readbacks
  world/     blocks, coordinates, palette storage, terrain + climate + noise, BFS lighting, water automaton,
             CPU mesher, streaming, raycast
  storage/   sparse chunk deltas, IndexedDB key-value store, world save/load
  audio/     procedural Web Audio sound effects
  physics/   swept AABB collision, walking player
  fx/        mining progress, debris particle ring buffer
  camera/    perspective camera, fly controller, input
  math/      zero-allocation vec3 / mat4 / frustum
  shaders/   WGSL: noise, climate, worldgen, gather, mesh, terrain, shadow, sky, overlay, particles, common
tests/       Vitest suites
tools/       Vite WGSL loader (#include expansion)
scripts/     headless GPU smoke test
.github/     CI and GitHub Pages deployment workflows
```

Constants shared by TypeScript and WGSL (buffer layouts, capacities, block ids, render classes, texture layers) are defined once in TypeScript and generated into a WGSL prelude.

## License

MIT, see [LICENSE](LICENSE).
