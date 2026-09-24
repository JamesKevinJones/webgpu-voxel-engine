# webgpu-voxel-engine

A chunk-based voxel engine written in TypeScript on WebGPU. Terrain is generated, meshed and drawn entirely on the GPU:

- **World generation**: a WGSL compute pass builds terrain from a 2D heightmap (continentalness spline, erosion, hills, ridged mountains) plus low-gradient 3D detail. It carves worm caves underground, then decorates the surface with grass, dirt, sand beaches, trees and a bedrock floor. The result goes as palette-encoded chunks straight into a GPU voxel pool.
- **Greedy meshing**: a WGSL compute pass culls hidden faces, computes per-vertex ambient occlusion from the 26 neighbours and merges coplanar faces. It appends packed vertices through atomic counters and fills a `drawIndexedIndirect` record for each chunk.
- **Rendering**: the vertex shader pulls vertices from storage buffers, and each chunk is one indirect draw. Blocks use a procedural 16×16 pixel-art texture array. Lighting is a GGX sun/moon key light that follows a day–night cycle, plus hemispherical ambient with baked AO, height-aware exponential fog, ACES tonemapping and gamma. The sky is a two-colour gradient dome that shifts from dawn to midday to dusk to a starry night. Water has animated UV waves and depth-based transparency.
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
| Mouse wheel | Freecam base speed |
| T / `[` `]` | Pause time of day / move the clock ±1 hour |
| Left / right click | Break / place block (bedrock is unbreakable) |
| 1–8 | Block to place (stone, dirt, grass, sand, water, basalt, wood, leaves) |

URL parameters: `seed`, `radius` (view distance in chunks, default 8), `time` (start time of day, 0–1, where 0.5 is noon), `daylen` (seconds per day, 0 freezes the clock), `gen` / `mesh` (chunks generated / meshed per frame) and `offscreen=1` (render to an offscreen texture, for headless automation).

The overlay shows the movement mode, the player state (grounded, airborne, swimming), the time of day, FPS, frame time, loaded / queued / meshed / visible chunks, vertex and triangle counts, GPU slot usage, memory, camera position, chunk coordinates and the targeted block.

## Architecture

```
src/
  core/      engine loop, WebGPU context, frame uniforms, stats overlay, debug API
  gpu/       GPU resources + compute passes (world-gpu), render pipelines, readback pool, WGSL prelude
  world/     chunk storage, coordinates, streaming, terrain + noise mirrors, CPU reference mesher, raycast
  camera/    perspective camera, fly controller, input
  physics/   swept AABB vs voxel collision, walking player
  math/      zero-allocation vec3 / mat4 / frustum
  shaders/   WGSL: noise, worldgen, gather, mesh, terrain, sky, common
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
  → render: sky, opaque (front→back), water (back→front)               │ → CPU chunk state
submit (at most 2 frames in flight)  ◄───────────────────────────────┘
```

### Terrain

`src/world/terrain.ts` and `src/shaders/worldgen.wgsl` implement the same functions (a unit test compares their numeric constants):

1. **Heightmap**: continentalness noise feeds a piecewise-linear spline (ocean shelf −38 → beaches ≈ 0 → plains → highlands). An erosion field scales hills and ridged mountains, which gives flat plains, rolling hills and sharp peaks. Sea level is Y = 0.
2. **Density** is `targetHeight − y + 4·simplex3(p·0.03)`. The detail term's vertical gradient stays below 1, so density strictly decreases with height. Every column therefore has exactly one surface and there are no floating slivers; a test checks this.
3. **Worm caves** are where two ridged 2-octave 3D fields both peak. They are carved only for Y in [−40, 20], faded at the band edges, and only where density > 5, so the surface stays intact.
4. **Decoration**: grass on top, 3 dirt, stone below. Sand is used where the top layers are at or below Y = 2 (beaches, sea floors). Basalt sits deep down, bedrock covers the bottom 1–3 layers, and bare rock replaces grass above Y = 62. Trees are placed at most one per 8×8 cell, with the canopy kept inside the cell so a worldgen workgroup only needs its own cells.

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
- GPU voxel slot layout: `[bits, paletteLen, nonAir, 0] [palette × 16] [packed data ≤ 4096 words]`. Worldgen writes 4-bit indices with an identity palette. CPU edits upload their compact encoding, and `gather.wgsl` decodes any width.
- Generated chunks are read back once and stored on the CPU in palette-compressed form. That copy is used for raycasting, edits and the GPU/CPU parity checks. All-air chunks give their GPU slot back.

### GPU meshing

1. **Gather** (`gather.wgsl`) expands a chunk plus a one-voxel border from its 26 neighbour slots into a dense 34³ byte volume. Missing neighbours read as air.
2. **Mesh** (`mesh.wgsl`) dispatches one 32-thread workgroup per `(slice, face direction, chunk)`.
   - Phase 1: each thread scans one row, computes each cell's face key (block id + four 2-bit AO levels) and stores maximal runs in workgroup memory.
   - Phase 2: each thread owns a run-start column and merges vertically identical runs into quads.
   - Faces only merge when both type and AO match, so AO interpolation stays correct. Quads are rotated so the shared diagonal joins the brighter corners.
3. Each quad takes a slot through `atomicAdd` on the chunk's counter and writes 4 packed `u32` vertices (position 6+6+6 bits, face, AO, block). It then adds 6 to the chunk's indirect `indexCount`.

Mesh slots have fixed capacity: 6144 opaque and 1024 water quads per chunk. Because each indirect record's `baseVertex` is `slot × capacity`, the vertex shader recovers the chunk origin from `vertex_index`, and one 16-bit index buffer serves every draw. Overflow is detected from the counters and shown in the overlay. Chunks that produce no quads free their mesh slot.

`src/world/mesher.ts` is a CPU implementation of the same algorithm. The unit tests check it for coverage, winding, AO and diagonal invariants. The GPU smoke test checks that the GPU mesher produces exactly the same quad counts on every chunk.

### Streaming

`ChunkManager` is plain logic with no GPU calls. It covers a cylinder of `radius` chunks (y from −64 to 127), hands out generation and meshing work nearest-first, and meshes a chunk only after every neighbour inside the region has been generated. It re-meshes neighbours when a chunk arrives or an edit touches a border, and drops stale async results using per-job tokens.

## Verification

- `npm test` runs 130 unit tests: AABB sweeps and player physics (landing, jumping, sprint, friction, step-up, walls, ceilings, swimming, no tunnelling or clipping), terrain realism (monotonic density, layering, beaches, cave band, bedrock, trees), time of day and textures, coordinate transforms and neighbour resolution, bit-packing and palette invariants (including the GPU layout decoded exactly as the shader does), noise determinism and range (hash golden values checked with independent arithmetic), terrain seams, matrix, frustum and camera math, raycasting, streaming and slot bookkeeping, greedy-mesh invariants on random volumes, WGSL include resolution, prelude constants, and a check that the `Frame` uniform layout matches the WGSL struct.
- `npm run test:gpu` serves the build, runs it in headless Chromium on WebGPU (SwiftShader works without a GPU) and fails on any WGSL or validation error. It also checks:
  - GPU terrain matches the CPU mirror (≤ 0.1 % of voxels may differ from f32 rounding; in practice about 0.0005 %)
  - GPU mesh quad counts equal the CPU mesher on every chunk, before and after voxel edits
  - in walking mode, the player lands on the generated terrain and walks without clipping into it
  - It writes noon, dusk, night and walking screenshots to `scripts/out/`.

  Headless Chromium can't present a WebGPU canvas without a display, so this test uses `offscreen=1` and captures frames through the debug API (`globalThis.__voxel`).

`.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 dependency-resolution crash ("Cannot read properties of null (reading 'edgesOut')") triggered by Vitest's optional peer dependencies.
