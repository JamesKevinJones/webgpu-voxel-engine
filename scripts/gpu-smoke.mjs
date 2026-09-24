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
 *   - a CPU-side voxel edit is uploaded and re-meshed consistently,
 *   - walking mode lands the player on the terrain and walks without clipping into it.
 * Screenshots (noon / dusk / night / walking) are written to scripts/out/.
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
    // Wait for two frames rendered after the latest state change (software GPUs are slow).
    const start = await page.evaluate(() => globalThis.__voxel.engine.completedFrames);
    await page.waitForFunction((n) => globalThis.__voxel.engine.completedFrames >= n + 2, start, { timeout: 120_000, polling: 100 });
    const png = await page.evaluate(() => globalThis.__voxel.screenshot());
    writeFileSync(join(outDir, name), Buffer.from(png.split(',')[1], 'base64'));
    console.log(`screenshot: ${join(outDir, name)}`);
  };
  await page.evaluate(() => globalThis.__voxel.setTime(0.5));
  await capture('overview.png');
  // Ground-level view across the terrain (textures, AO, water, fog) at noon, dusk and night.
  const ground = await page.evaluate(() => {
    const v = globalThis.__voxel;
    const y = v.surfaceAt(20, 20) ?? 20;
    v.teleport(20.5, Math.max(y, 0) + 6, 20.5, -2.3, -0.12);
    return y;
  });
  await waitSettled(page, 'ground view');
  await capture('ground-noon.png');
  await page.evaluate(() => globalThis.__voxel.setTime(0.34));
  await capture('ground-morning-shadows.png');
  // Shadow check: render the same view with and without shadow maps and compare.
  const frameAfter = async (enabled) => {
    await page.evaluate((on) => { globalThis.__voxel.engine.shadowsEnabled = on; }, enabled);
    const start = await page.evaluate(() => globalThis.__voxel.engine.completedFrames);
    await page.waitForFunction((n) => globalThis.__voxel.engine.completedFrames >= n + 2, start, { timeout: 120_000, polling: 100 });
    await page.evaluate(async (key) => {
      const f = await globalThis.__voxel.engine.gpu.captureFrame();
      globalThis[key] = f.pixels;
    }, enabled ? '__shadowOn' : '__shadowOff');
  };
  await frameAfter(true);
  await frameAfter(false);
  await page.evaluate(() => { globalThis.__voxel.engine.shadowsEnabled = true; });
  const shadowed = await page.evaluate(() => {
    const a = globalThis.__shadowOn, b = globalThis.__shadowOff;
    let darker = 0, lighter = 0;
    for (let i = 0; i < a.length; i += 4) {
      const la = a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722;
      const lb = b[i] * 0.2126 + b[i + 1] * 0.7152 + b[i + 2] * 0.0722;
      if (la < lb * 0.85) darker++;
      if (la > lb * 1.05 + 2) lighter++;
    }
    return { darker: darker / (a.length / 4), lighter: lighter / (a.length / 4) };
  });
  console.log(`shadows darken ${(shadowed.darker * 100).toFixed(1)}% of pixels (brighten ${(shadowed.lighter * 100).toFixed(2)}%)`);
  // Plants sway and water animates between the two captures, so a few pixels change either way.
  if (shadowed.darker < 0.05) fail('shadow maps have no visible effect');
  if (shadowed.lighter > 0.02) fail('enabling shadows brightened a significant part of the frame');
  await page.evaluate(() => globalThis.__voxel.setTime(0.755));
  await capture('ground-dusk.png');
  await page.evaluate(() => globalThis.__voxel.setTime(0.02));
  await capture('ground-night.png');
  await page.evaluate(() => globalThis.__voxel.setTime(0.5));

  // Walking mode: drop the player onto the terrain, then walk forward for a while.
  await page.evaluate(() => globalThis.__voxel.setMode('walk'));
  // Frame deltas are clamped to 0.1 s, so on a slow software GPU simulated time runs far behind
  // wall time: wait for the conditions themselves (with generous timeouts) instead of fixed delays.
  const waitFor = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 300_000, polling: 250 }).then(() => true, () => false);
  await waitFor(() => { const p = globalThis.__voxel.player(); return p.grounded || p.inWater; });
  const landed = await page.evaluate(() => globalThis.__voxel.player());
  console.log(`player after drop: ${JSON.stringify(landed)} (surface ${ground})`);
  if (landed.embedded) fail('player is embedded in terrain after landing');
  if (!landed.grounded && !landed.inWater) fail('player did not land on the terrain');
  await page.evaluate(() => globalThis.__voxel.engine.input.keys.add('KeyW'));
  await waitFor((start) => {
    const p = globalThis.__voxel.player();
    return Math.hypot(p.x - start.x, p.z - start.z) > 2;
  }, landed);
  await page.evaluate(() => globalThis.__voxel.engine.input.keys.delete('KeyW'));
  const walked = await page.evaluate(() => globalThis.__voxel.player());
  const distance = Math.hypot(walked.x - landed.x, walked.z - landed.z);
  console.log(`player after walking: ${JSON.stringify(walked)} moved ${distance.toFixed(2)} m`);
  if (walked.embedded) fail('player clipped into terrain while walking');
  if (distance < 1) fail('player did not move while walking');
  await capture('walking.png');
  await page.evaluate(() => globalThis.__voxel.setMode('freecam'));

  // Mining: look straight down at the ground from close range and hold the left button.
  const minedBefore = await page.evaluate(() => {
    const v = globalThis.__voxel;
    const y = v.surfaceAt(6, 6) ?? 10;
    v.setBlock(6, y + 1, 6, 0); // clear any plant so the ground block is the target
    v.teleport(6.5, y + 2.6, 6.5, 0, -1.5);
    v.engine.input.buttons.add(0);
    return v.engine.blocksBroken;
  });
  await page.waitForFunction(() => globalThis.__voxel.engine.mining.progress > 0.3, null, { timeout: 120_000, polling: 50 });
  const mining = await page.evaluate(() => globalThis.__voxel.stats().mining);
  console.log(`mining progress while holding: ${mining}`);
  await capture('mining-cracks.png');
  await page.waitForFunction((n) => globalThis.__voxel.engine.blocksBroken > n, minedBefore, { timeout: 240_000, polling: 20 });
  const burst = await page.evaluate(() => {
    const v = globalThis.__voxel;
    v.engine.input.buttons.delete(0);
    return { size: v.engine.lastBurstSize, alive: v.particlesAlive() };
  });
  console.log(`debris burst: ${burst.size} fragments (${burst.alive} alive)`);
  if (burst.size < 16 || burst.size > 24 || burst.alive < 16) fail(`expected a burst of 16-24 debris particles, got ${JSON.stringify(burst)}`);
  await capture('mining-debris.png');

  // Biome tour: one screenshot per biome.
  for (const [biome, name] of [[0, 'plains'], [1, 'desert'], [2, 'snowy'], [3, 'forest']]) {
    const spot = await page.evaluate((b) => globalThis.__voxel.findBiome(b), biome);
    if (!spot) { fail(`no ${name} biome found`); continue; }
    await page.evaluate(([x, z]) => {
      const v = globalThis.__voxel;
      v.teleport(x + 0.5, 90, z + 0.5, 0.6, -0.35);
    }, spot);
    await waitSettled(page, `${name} biome`);
    await page.evaluate(([x, z]) => {
      const v = globalThis.__voxel;
      const y = v.surfaceAt(x, z) ?? 20;
      v.teleport(x + 0.5, Math.max(y, 0) + 30, z + 0.5, 0.6, -0.5);
    }, spot);
    await capture(`biome-${name}.png`);
    const view = await page.evaluate(() => { const s = globalThis.__voxel.stats(); return { camera: s.camera, biome: s.biome, visible: s.visibleChunks }; });
    console.log(`${name}: ${JSON.stringify(view)}`);
    if (view.visible === 0) fail(`${name} view shows no chunks`);
  }
  const tour = await page.evaluate(() => globalThis.__voxel.parity(400));
  console.log(`mesh parity after biome tour: ${tour.meshesCompared - tour.meshMismatches.length} / ${tour.meshesCompared}`);
  if (tour.meshMismatches.length > 0) fail(`mesh mismatches: ${JSON.stringify(tour.meshMismatches.slice(0, 5))}`);

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
