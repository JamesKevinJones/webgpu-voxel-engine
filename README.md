# webgpu-voxel-engine

A chunk-based voxel engine written in TypeScript on WebGPU. Terrain is generated, meshed and drawn entirely on the GPU:

- **World generation**: a WGSL compute pass evaluates hashed-gradient simplex noise (fBm and ridged octaves, 3D caves) and writes palette-encoded chunks straight into a GPU voxel pool.
- **Greedy meshing**: a WGSL compute pass culls hidden faces, computes per-vertex ambient occlusion from the 26 neighbours and merges coplanar faces. It appends packed vertices through atomic counters and fills a `drawIndexedIndirect` record for each chunk.
- **Rendering**: the vertex shader pulls vertices from storage buffers, and each chunk is one indirect draw. There is a GGX sun, hemispherical ambient with baked AO, height-aware exponential fog, ACES tonemapping and gamma. Water goes through an alpha-blended pass.

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
| W A S D | Move |
| Space / E, Q / C | Up, down |
| Shift | Boost ×4 |
| Mouse wheel | Change base speed |
| Left / right click | Break / place block |
| 1–6 | Pick block to place (stone, dirt, grass, sand, water, basalt) |

URL parameters: `seed`, `radius` (view distance in chunks, default 8), `gen` / `mesh` (chunks generated / meshed per frame) and `offscreen=1` (render to an offscreen texture, for headless automation).

The overlay shows FPS, frame time, loaded / queued / meshed / visible chunks, vertex and triangle counts, GPU slot usage, memory, camera position, chunk coordinates and the targeted block.

## Architecture

```
src/
  core/      engine loop, WebGPU context, frame uniforms, stats overlay, debug API
  gpu/       GPU resources + compute passes (world-gpu), render pipelines, readback pool, WGSL prelude
  world/     chunk storage, coordinates, streaming, terrain + noise mirrors, CPU reference mesher, raycast
  camera/    perspective camera, fly controller, input
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

- `npm test` runs 98 unit tests: coordinate transforms and neighbour resolution, bit-packing and palette invariants (including the GPU layout decoded exactly as the shader does), noise determinism and range (hash golden values checked with independent arithmetic), terrain seams, matrix, frustum and camera math, raycasting, streaming and slot bookkeeping, greedy-mesh invariants on random volumes, WGSL include resolution, prelude constants, and a check that the `Frame` uniform layout matches the WGSL struct.
- `npm run test:gpu` serves the build, runs it in headless Chromium on WebGPU (SwiftShader works without a GPU) and fails on any WGSL or validation error. It also checks:
  - GPU terrain matches the CPU mirror (≤ 0.1 % of voxels may differ from f32 rounding; in practice about 0.0005 %)
  - GPU mesh quad counts equal the CPU mesher on every chunk, before and after voxel edits
  - It writes screenshots to `scripts/out/`.

  Headless Chromium can't present a WebGPU canvas without a display, so this test uses `offscreen=1` and captures frames through the debug API (`globalThis.__voxel`).

`.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 dependency-resolution crash ("Cannot read properties of null (reading 'edgesOut')") triggered by Vitest's optional peer dependencies.
