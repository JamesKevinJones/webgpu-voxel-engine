#!/usr/bin/env node
/**
 * End-to-end GPU smoke test.
 *
 * Serves the production build, opens it in headless Chromium with WebGPU enabled (SwiftShader
 * works when no hardware GPU is present), waits for streaming to settle and then checks:
 *   - no WGSL compilation / WebGPU validation errors were reported,
 *   - chunks were generated and meshed on the GPU,
 *   - worldgen.wgsl output matches the CPU terrain mirror (tolerating rare f32 rounding),
 *   - gather.wgsl + mesh.wgsl quad counts exactly match the CPU reference greedy mesher,
 *   - a CPU-side voxel edit is uploaded and re-meshed consistently.
 * A screenshot is written to scripts/out/smoke.png.
 *
 * Usage: npm run build && npm run test:gpu   (needs Playwright + a Chromium build)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', 'out');
const radius = Number(process.env.SMOKE_RADIUS ?? 4);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 240_000);

async function loadPlaywright() {
  let mod;
  try {
    mod = await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    const require = createRequire(join(globalRoot, 'noop.js'));
    mod = await import(pathToFileURL(require.resolve('playwright')).href);
  }
  return mod.chromium ? mod : mod.default;
}

async function waitSettled(page, label) {
  const start = Date.now();
  let lastLog = 0;
  for (;;) {
    const state = await page.evaluate(() => {
      const v = globalThis.__voxel;
      const s = v.stats();
      return { settled: v.settled(), ready: s.chunksLoaded, pending: s.chunksPending, gen: s.chunksGenerating, mesh: s.meshQueue, meshed: s.meshedChunks, fps: s.fps, error: String(v.engine.lastError ?? '') };
    });
    if (state.error) throw new Error(`engine error: ${state.error}`);
    if (state.settled) return;
    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) throw new Error(`${label}: streaming did not settle within ${timeoutMs} ms (${JSON.stringify(state)})`);
    if (elapsed - lastLog > 10_000) {
      lastLog = elapsed;
      console.log(`  [${label} ${(elapsed / 1000).toFixed(0)}s] ready=${state.ready} pending=${state.pending} generating=${state.gen} meshQueue=${state.mesh} meshed=${state.meshed} fps=${state.fps.toFixed(1)}`);
    }
    await page.waitForTimeout(500);
  }
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exitCode = 1;
}

const { chromium } = await loadPlaywright();
const server = await preview({ root, preview: { port: 4179, strictPort: false, host: '127.0.0.1' }, logLevel: 'warn' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    ...(process.env.SMOKE_CHROME_LOG ? ['--enable-logging=stderr', '--v=0'] : []),
    '--enable-unsafe-webgpu',
    '--use-webgpu-adapter=swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') errors.push(text);
    if (process.env.SMOKE_VERBOSE || msg.type() === 'error' || msg.type() === 'warning') console.log(`[browser ${msg.type()}] ${text}`);
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  const started = Date.now();
  // Headless Chromium cannot present WebGPU canvases (no swap-chain shared images without a
  // display), so the engine renders offscreen and frames are captured through the debug API.
  await page.goto(`${url}?seed=1337&radius=${radius}&offscreen=1${process.env.SMOKE_QUERY ?? ''}`);
  await page.waitForFunction(() => '__voxel' in globalThis || !document.querySelector('#error')?.hidden, null, { timeout: 60_000 });
  const startupError = await page.evaluate(() => (document.querySelector('#error')?.hidden ? null : document.querySelector('#error')?.textContent));
  if (startupError) throw new Error(`engine failed to start: ${startupError.trim()}`);

  // Look at the terrain from above so the screenshot shows something meaningful.
  await page.evaluate(() => globalThis.__voxel.teleport(0.5, globalThis.__voxel.engine.camera.position[1] + 25, 40.5, 0, -0.45));
  await waitSettled(page, 'initial load');
  console.log(`streaming settled in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await page.evaluate(() => globalThis.__voxel.engine.flush());

  const stats = await page.evaluate(() => globalThis.__voxel.stats());
  console.log(`chunks ready=${stats.chunksLoaded} meshed=${stats.meshedChunks} visible=${stats.visibleChunks} vertices=${stats.vertices} overflow=${stats.overflowChunks}`);
  if (stats.chunksLoaded === 0) fail('no chunks were generated');
  if (stats.meshedChunks === 0 || stats.vertices === 0) fail('no geometry was produced by the GPU mesher');
  if (stats.overflowChunks > 0) fail(`${stats.overflowChunks} chunks overflowed their mesh slots`);

  const parity = await page.evaluate(() => globalThis.__voxel.parity(400));
  const mismatchRate = parity.voxelMismatches / Math.max(1, parity.voxelsCompared);
  console.log(`worldgen parity: ${parity.voxelMismatches} / ${parity.voxelsCompared} voxels differ (${(mismatchRate * 100).toFixed(4)}%) over ${parity.chunksCompared} chunks`);
  console.log(`mesh parity: ${parity.meshesCompared - parity.meshMismatches.length} / ${parity.meshesCompared} chunks match the CPU mesher`);
  if (parity.chunksCompared === 0 || parity.meshesCompared === 0) fail('parity check compared nothing');
  if (mismatchRate > 1e-3) fail('GPU world generation diverges from the CPU mirror');
  if (parity.meshMismatches.length > 0) fail(`mesh mismatches: ${JSON.stringify(parity.meshMismatches.slice(0, 5))}`);

  // Edit: dig a 3x3 shaft on a chunk border (exercises upload, palette re-encoding and neighbour remeshing).
  const edited = await page.evaluate(() => {
    const v = globalThis.__voxel;
    let changed = 0;
    for (let y = -10; y <= 40; y++) {
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (v.setBlock(x, y, z, 0)) changed++;
    }
    if (v.setBlock(3, 70, 3, 6)) changed++;
    return changed;
  });
  console.log(`edited ${edited} voxels`);
  await waitSettled(page, 'after edit');
  await page.evaluate(() => globalThis.__voxel.engine.flush());
  const afterEdit = await page.evaluate(() => {
    const v = globalThis.__voxel;
    const gpuEdited = [];
    return { parity: v.parity(400), gpuEdited };
  });
  const editMeshMismatches = afterEdit.parity.meshMismatches;
  console.log(`post-edit mesh parity: ${afterEdit.parity.meshesCompared - editMeshMismatches.length} / ${afterEdit.parity.meshesCompared}`);
  if (edited === 0) fail('voxel edit had no effect');
  if (editMeshMismatches.length > 0) fail(`post-edit mesh mismatches: ${JSON.stringify(editMeshMismatches.slice(0, 5))}`);

  mkdirSync(outDir, { recursive: true });
  const capture = async (name) => {
    await page.waitForTimeout(400);
    const png = await page.evaluate(() => globalThis.__voxel.screenshot());
    writeFileSync(join(outDir, name), Buffer.from(png.split(',')[1], 'base64'));
    console.log(`screenshot: ${join(outDir, name)}`);
  };
  await capture('overview.png');
  // Ground-level view across the terrain (AO, materials, water, fog).
  await page.evaluate(() => {
    const v = globalThis.__voxel;
    const y = v.surfaceAt(20, 20) ?? 20;
    v.teleport(20.5, Math.max(y, 12) + 6, 20.5, -2.3, -0.12);
  });
  await waitSettled(page, 'ground view');
  await capture('ground.png');
  const finalStats = await page.evaluate(() => globalThis.__voxel.stats());
  console.log(`fps≈${finalStats.fps.toFixed(1)} (software rasteriser) · GPU pools ${finalStats.gpuMemoryMB.toFixed(0)} MB`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

if (errors.length > 0) fail(`browser reported ${errors.length} error(s):\n  ${errors.slice(0, 10).join('\n  ')}`);
if (!process.exitCode) console.log('\n✓ GPU smoke test passed');
