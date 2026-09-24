# webgpu-voxel-engine

A chunk-based voxel engine written in TypeScript on WebGPU. Terrain is generated, meshed and drawn entirely on the GPU:

- **World generation**: a WGSL compute pass evaluates a climate model (continentalness, temperature, humidity) and blends four biomes: plains, desert, snowy mountains and dense forest. It builds a 2D heightmap with rounded mountain crests, adds 3D detail that fades with altitude and carves worm caves. It then decorates each biome with its own surface blocks, trees (oak, birch, pine, cactus) and plants (tall grass, flowers). The result goes as palette-encoded chunks straight into a GPU voxel pool.
- **Greedy meshing**: a WGSL compute pass culls hidden faces, computes per-vertex ambient occlusion from the 26 neighbours and merges coplanar faces. It appends packed vertices through atomic counters and fills a `drawIndexedIndirect` record for each chunk.
- **Rendering**: the vertex shader pulls vertices from storage buffers, and each chunk is one indirect draw. Blocks use a procedural 16×16 pixel-art texture array, and grass and leaves are tinted by a smoothly blended biome palette. Lighting is a GGX sun/moon key light that follows a day–night cycle, with 2-cascade shadow maps (PCF, slope-scaled normal bias, blended cascades), plus hemispherical ambient with baked AO, height-aware exponential fog, ACES tonemapping and gamma. Glass and plants use an alpha-tested cutout pass, and water has animated UV waves and depth-based transparency.
- **Interaction**: hold the left button to mine, with 10 crack stages overlaid on the target. Broken blocks burst into 16–24 textured debris fragments, simulated by a compute shader. There is also a wireframe target box and a 9-slot hotbar.
- **Player physics**: toggle between free-fly and walking. Walking uses a 0.6 × 1.8 m AABB with gravity, jumping, sprinting, friction, swimming and automatic step-up, resolved with swept per-axis collision against the voxel grid.

```
npm install
npm run dev        # http://localhost:5173 (needs a WebGPU browser: Chrome/Edge 113+, Safari 26+)
npm test           # vitest unit tests
npm run build      # strict type-check + production bundle
npm run test:gpu   # headless end-to-end GPU test (after `npm run build`, needs Playwright + Chromium)
```

## Controls

| Input | Action |
| --- | --- |
| Click | Capture mouse (pointer lock) |
| Mouse | Look |
| V | Toggle Freecam ↔ Walking |
| W A S D | Move |
| Space | Freecam: up · Walking: jump (swim up in water) |
| Q / C | Freecam: down |
| Shift | Freecam: boost ×4 · Walking: sprint |
| Mouse wheel | Freecam: base speed · Walking: cycle hotbar |
| T / `[` `]` | Pause time of day / move the clock ±1 hour |
| G | Toggle shadows |
| Hold left button | Mine the targeted block (break time depends on the block; bedrock is unbreakable) |
| Right click | Place the selected hotbar block |
| 1–9 | Hotbar: stone, dirt, grass, sand, oak log, leaves, glass, cobblestone, brick |

URL parameters: `seed`, `radius` (view distance in chunks, default 8), `time` (start time of day, 0–1, where 0.5 is noon), `daylen` (seconds per day, 0 freezes the clock), `gen` / `mesh` (chunks generated / meshed per frame) and `offscreen=1` (render to an offscreen texture, for headless automation).

The overlay shows the movement mode, the player state (grounded, airborne, swimming), the time of day, the biome, shadow state, mining progress, live particles, FPS, frame time, loaded / queued / meshed / visible chunks, vertex and triangle counts, GPU slot usage, memory, camera position, chunk coordinates and the targeted block.

## Architecture

```
src/
  core/      engine loop, WebGPU context, frame uniforms, stats overlay, debug API
  gpu/       GPU resources + compute passes (world-gpu), render pipelines, readback pool, WGSL prelude
  world/     chunk storage, coordinates, streaming, terrain + noise mirrors, CPU reference mesher, raycast
  camera/    perspective camera, fly controller, input
  physics/   swept AABB vs voxel collision, walking player
  fx/        mining progress, debris particle ring buffer (+ CPU reference simulation)
  math/      zero-allocation vec3 / mat4 / frustum
  shaders/   WGSL: noise, climate, worldgen, gather, mesh, terrain, shadow, sky, overlay, particles, common
tests/       vitest suites
tools/       Vite WGSL loader (default-exported strings with #include expansion)
scripts/     headless GPU smoke test
```

### Frame pipeline

```
input → camera → ChunkManager.updateCenter (stream in/out)
  → upload edited chunks (queue.writeBuffer)
  → worldgen pass           (≤ gen chunks)    → copy slots to staging ─┐
  → gather pass + mesh pass (≤ mesh chunks)   → copy counters ────────┤ async mapAsync
  → particle simulation (compute)                                      │ → CPU chunk state
  → shadow passes: opaque chunks → 2 cascade layers (depth32float)     │
  → main pass: sky, opaque (front→back), cutout (glass, plants)        │
  → late pass (read-only depth): particles, water (back→front),        │
    crack overlay, target box                                          │
submit (at most 2 frames in flight)  ◄───────────────────────────────┘
```

### Terrain

`src/world/terrain.ts` and `src/shaders/climate.wgsl` + `worldgen.wgsl` implement the same functions (a unit test compares their numeric constants):

1. **Climate**: low-frequency temperature and humidity noise give smooth biome weights (non-negative, summing to 1). The dominant weight picks the biome: **desert** (hot and dry), **snowy mountains** (cold), **dense forest** (wet) and **plains** (the rest). The same model runs in the terrain vertex shader to tint grass and leaves from a bilinear palette (dry = yellower, wet = greener, forests darker), so tints blend smoothly across biome borders.
2. **Heightmap**: continentalness feeds a piecewise-linear spline (ocean shelf −38 → beaches ≈ 0 → plains → highlands). Biome-weighted hills, desert dunes and ridged mountains (taller in snowy biomes) are scaled by an erosion field. Ridge crests use a smooth absolute value, so there are no cusps. Sea level is Y = 0.
3. **Density** is `targetHeight − y + detail(y)·simplex3(p·0.03)`. The detail amplitude fades from 4 to 1 between Y = 28 and 64, so there are no rock needles or monoliths on peaks; a test bounds any column at ≤ 2 blocks above all its neighbours. The vertical gradient stays below 1, so density strictly decreases with height, every column has one surface, and nothing floats.
4. **Worm caves** are where two ridged 2-octave 3D fields both peak. They are carved only for Y in [−40, 20] and only where density > 5.
5. **Decoration** by biome:
   - plains and forest: grass over 3 dirt
   - desert: sand over a sandstone band
   - snowy mountains: snow cover, exposed stone peaks above Y = 70, and ice where the sea freezes
   - everywhere: sand on beaches, basalt deep down, bedrock at the bottom
6. **Trees**: at most one per 8×8 cell, with the trunk kept 2 blocks from the cell border so the canopy stays inside the cell. They grow only on their biome's ground: oak on plains grass (sparse), oak and birch in forests (dense), pine on snow, cactus on desert sand. Each needs sky clearance up to the world top, and no neighbouring column may rise into the canopy.
7. **Plants**: tall grass and red and yellow flowers grow on grass in plains and forests. They are cross plants: two diagonal quads drawn double-sided with alpha testing.

### Player physics

`src/physics/aabb.ts` sweeps an AABB along one axis at a time (Y, X, Z) through every voxel layer between the leading face and the target. Fast movement can't tunnel, and faces that only touch are not collisions, so the player slides along walls. `Player` (`src/physics/player.ts`) integrates at a fixed 120 Hz:
- gravity is 9.8 × 2.8 m/s², with jumps derived from a 1.25 m apex
- walking is 4.3 m/s and sprinting 7 m/s, with exponential velocity blending that doubles as ground and air friction
- water gives buoyant swimming
- when a grounded move is blocked, it retries from one block higher (step-up) and smooths the camera

Unloaded chunks count as solid, and the simulation pauses until the terrain under the player exists.

### Chunks and storage

- Chunks are 32³ voxels. The local index is `x | y << 5 | z << 10`, with x fastest. `coords.ts` converts between world, chunk and local coordinates, resolves neighbour lookups one voxel outside the chunk (`resolveNeighbor`) and packs chunk keys into 48-bit integers.
- `PalettedChunk` stores palette indices in a `Uint32Array` at 0, 1, 2, 4, 8 or 16 bits. Widths are powers of two, so an index never straddles a word. Palette entries are reference-counted and recycled, so a chunk never needs more entries than it has distinct block types. `compact()` shrinks the index width again.
- GPU voxel slot layout: `[bits, paletteLen, nonAir, 0] [palette × 32] [packed data ≤ 8192 words]`. There are 23 block types, so worldgen writes 8-bit indices with an identity palette. CPU edits upload their compact encoding, and `gather.wgsl` decodes any width.
- Generated chunks are read back once and stored on the CPU in palette-compressed form. That copy is used for raycasting, edits and the GPU/CPU parity checks. All-air chunks give their GPU slot back.

### GPU meshing

1. **Gather** (`gather.wgsl`) expands a chunk plus a one-voxel border from its 26 neighbour slots into a dense 34³ byte volume. Missing neighbours read as air.
2. **Mesh** (`mesh.wgsl`) dispatches one 32-thread workgroup per `(slice, face direction, chunk)`.
   - Phase 1: each thread scans one row, computes each cell's face key (block id + four 2-bit AO levels) and stores maximal runs in workgroup memory.
   - Phase 2: each thread owns a run-start column and merges vertically identical runs into quads.
   - Faces only merge when both type and AO match, so AO interpolation stays correct. Quads are rotated so the shared diagonal joins the brighter corners.
3. Each quad takes a slot through `atomicAdd` on the chunk's counter for its pool (opaque, water or cutout) and writes 4 packed `u32` vertices (position 6+6+6 bits, face, AO, 5-bit block). It then adds 6 to that pool's indirect `indexCount`. Cross plants are emitted by the +X workgroups as two diagonal quads (face codes 6 and 7).

Mesh slots have fixed capacity: 6144 opaque, 1024 water and 2048 cutout quads per chunk. The three indirect records of a slot live in one buffer. Because each indirect record's `baseVertex` is `slot × capacity`, the vertex shader recovers the chunk origin from `vertex_index`, and one 16-bit index buffer serves every draw. Overflow is detected from the counters and shown in the overlay. Chunks that produce no quads free their mesh slot.

`src/world/mesher.ts` is a CPU implementation of the same algorithm. The unit tests check it for coverage, winding, AO and diagonal invariants. The GPU smoke test checks that the GPU mesher produces exactly the same quad counts on every chunk.

### Shadows

`src/core/cascades.ts` splits the view depth up to 160 m into 2 cascades with the practical scheme (λ = 0.75). Each cascade wraps its frustum slice in a bounding sphere: the orthographic box keeps its size while the camera turns, and its centre is snapped to whole shadow texels in a light-space basis that only depends on the light direction, which stops shimmering.

The box extends 120 m towards the light, so off-screen mountains and trees still cast shadows. A depth-only pipeline renders the opaque chunk geometry into a 2048² `depth32float` texture array, one layer per cascade. The terrain shader then:
- offsets the lookup along the normal by a slope-scaled amount (acne-free on grazing faces)
- takes 9 filtered comparison samples (3×3 PCF on top of the bilinear comparison)
- cross-fades between cascades over the last 15 % of cascade 0, and fades shadows out at the shadow distance

### Mining and particles

`MiningState` accumulates progress while the left button stays on the same voxel. Its rate comes from the block's break time: plants break instantly and bedrock never does. The progress drives 10 procedurally generated crack textures, drawn on a slightly enlarged cube over the target, together with the wireframe box.

A broken block emits 16–24 fragments into a 1024-slot ring buffer. The CPU only writes the new slots. A compute shader integrates gravity, floor rebound (restitution plus friction) and lifetime, and an instanced draw renders each fragment as a small cube textured with a random piece of the broken block. `stepParticle` in `src/fx/particles.ts` mirrors the shader for tests.

### Streaming

`ChunkManager` is plain logic with no GPU calls. It covers a cylinder of `radius` chunks (y from −64 to 127), hands out generation and meshing work nearest-first, and meshes a chunk only after every neighbour inside the region has been generated. It re-meshes neighbours when a chunk arrives or an edit touches a border, and drops stale async results using per-job tokens.

## Verification

- `npm test` runs 164 unit tests: cascade splits, fitting (every slice corner inside the light volume, caster margin, texel-snapped stability, rotation-invariant size), biome weights and palette blending, rock-needle bounds, tree placement boundaries, species, ground and clearance, plants, snow and ice, sandstone, particle spawning, ring wrap and simulation, mining stages and the hotbar, glass and cross-plant meshing, AABB sweeps and player physics (landing, jumping, sprint, friction, step-up, walls, ceilings, swimming, no tunnelling or clipping), terrain realism (monotonic density, layering, beaches, cave band, bedrock, trees), time of day and textures, coordinate transforms and neighbour resolution, bit-packing and palette invariants (including the GPU layout decoded exactly as the shader does), noise determinism and range (hash golden values checked with independent arithmetic), terrain seams, matrix, frustum and camera math, raycasting, streaming and slot bookkeeping, greedy-mesh invariants on random volumes, WGSL include resolution, prelude constants, and a check that the `Frame` uniform layout matches the WGSL struct.
- `npm run test:gpu` serves the build, runs it in headless Chromium on WebGPU (SwiftShader works without a GPU) and fails on any WGSL or validation error. It also checks:
  - GPU terrain matches the CPU mirror (≤ 0.1 % of voxels may differ from f32 rounding; in practice about 0.0005 %)
  - GPU mesh quad counts equal the CPU mesher on every chunk, before and after voxel edits
  - in walking mode, the player lands on the generated terrain and walks without clipping into it
  - shadows darken a significant share of pixels compared with the same frame rendered without them
  - holding the mouse button advances the crack stages, and breaking emits a 16–24 fragment burst
  - mesh parity holds after a tour of all four biomes
  - It writes noon, morning-shadow, dusk, night, walking, mining and per-biome screenshots to `scripts/out/`.

  Headless Chromium can't present a WebGPU canvas without a display, so this test uses `offscreen=1` and captures frames through the debug API (`globalThis.__voxel`).

`.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 dependency-resolution crash ("Cannot read properties of null (reading 'edgesOut')") triggered by Vitest's optional peer dependencies.
