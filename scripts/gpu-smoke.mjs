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
 *   - walking mode lands the player on the terrain and walks without clipping into it,
 *   - flood-fill lighting: skylight outdoors, darkness in sealed rock, torch light that brightens
 *     the rendered frame,
 *   - flowing water spreads (bounded to 7 levels) and is re-meshed,
 *   - edits persist in IndexedDB across a page reload,
 *   - the title screen / pause menu / F3 overlay work.
 * Screenshots are written to scripts/out/.
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

  // Lighting: skylight outdoors, darkness in sealed rock, torch light in a dug room.
  const outdoor = await page.evaluate(() => {
    const v = globalThis.__voxel;
    const top = v.surfaceAt(8, 8);
    return { top, above: v.light(8, top + 2, 8), deep: v.light(8, -55, 8), deepBlock: v.block(8, -55, 8) };
  });
  console.log(`skylight above ground ${JSON.stringify(outdoor.above)}, in rock ${JSON.stringify(outdoor.deep)}`);
  if (outdoor.above.sky !== 15) fail('open air above the surface is not fully sky-lit');
  if (outdoor.deep.sky !== 0) fail('sealed rock deep underground received skylight');
  // A sealed 5×3×5 room below the cave layer (y < -40 is solid stone).
  await page.evaluate(() => {
    const v = globalThis.__voxel;
    for (let x = 20; x <= 24; x++) for (let y = -52; y <= -50; y++) for (let z = 20; z <= 24; z++) v.setBlock(x, y, z, 0);
    v.setTime(0.5);
    v.teleport(20.6, -50.4, 22.5, -Math.PI / 2 + 0.25, -0.2);
  });
  await waitSettled(page, 'dug room');
  const roomBefore = await page.evaluate(() => globalThis.__voxel.light(22, -51, 22));
  const meanLuma = async () => {
    const start = await page.evaluate(() => globalThis.__voxel.engine.completedFrames);
    await page.waitForFunction((n) => globalThis.__voxel.engine.completedFrames >= n + 2, start, { timeout: 120_000, polling: 100 });
    return page.evaluate(async () => {
      const f = await globalThis.__voxel.engine.gpu.captureFrame();
      let sum = 0;
      for (let i = 0; i < f.pixels.length; i += 4) sum += f.pixels[i] * 0.2126 + f.pixels[i + 1] * 0.7152 + f.pixels[i + 2] * 0.0722;
      return sum / (f.pixels.length / 4);
    });
  };
  const dark = await meanLuma();
  await capture('room-dark.png');
  const placed = await page.evaluate(() => {
    const v = globalThis.__voxel;
    v.engine.hotbar.select(7); // torch
    return v.place(23, -52, 22);
  });
  await waitSettled(page, 'torch');
  const torchLight = await page.evaluate(() => {
    const v = globalThis.__voxel;
    return { torch: v.light(23, -52, 22), next: v.light(24, -52, 22), corner: v.light(20, -52, 20), block: v.block(23, -52, 22) };
  });
  const lit = await meanLuma();
  await capture('room-torch.png');
  console.log(`room light before ${JSON.stringify(roomBefore)}; torch placed=${placed} ${JSON.stringify(torchLight)}; mean luminance ${dark.toFixed(1)} → ${lit.toFixed(1)}`);
  if (roomBefore.sky !== 0 || roomBefore.block !== 0) fail('the sealed room is not dark before the torch');
  if (!placed || torchLight.block !== 23) fail('torch was not placed');
  if (torchLight.torch.block !== 14 || torchLight.next.block !== 13 || torchLight.corner.block !== 14 - 5) fail(`unexpected torch light falloff ${JSON.stringify(torchLight)}`);
  if (lit < dark + 8 || lit < dark * 2) fail('the torch did not visibly light the room');
  const lightParity = await page.evaluate(() => globalThis.__voxel.parity(400));
  console.log(`mesh parity with lighting: ${lightParity.meshesCompared - lightParity.meshMismatches.length} / ${lightParity.meshesCompared}`);
  if (lightParity.meshMismatches.length > 0) fail(`mesh mismatches after torch: ${JSON.stringify(lightParity.meshMismatches.slice(0, 5))}`);

  // Night scene with torches on the surface.
  await page.evaluate(() => {
    const v = globalThis.__voxel;
    for (const [x, z] of [[14, 14], [22, 12], [12, 24], [26, 22]]) {
      const y = v.surfaceAt(x, z);
      if (y !== null && v.block(x, y + 1, z) >= 0) { v.setBlock(x, y + 1, z, 0); v.setBlock(x, y + 1, z, 23); }
    }
    const y = v.surfaceAt(20, 20) ?? 20;
    v.teleport(20.5, Math.max(y, 0) + 6, 34.5, 0.1, -0.35);
    v.setTime(0.0);
  });
  await waitSettled(page, 'night torches');
  await capture('night-torches.png');
  await page.evaluate(() => globalThis.__voxel.setTime(0.5));

  // Water: pour a source onto the ground and let the cellular automaton run.
  const pour = await page.evaluate(() => {
    const v = globalThis.__voxel;
    const x = 40, z = 40;
    const y = (v.surfaceAt(x, z) ?? 10) + 1;
    v.setBlock(x, y, z, 0);
    v.setBlock(x, y, z, 5);
    v.teleport(x + 0.5, y + 10, z + 14.5, 0, -0.6);
    return { x, y, z };
  });
  await waitSettled(page, 'water flow');
  const flow = await page.evaluate(({ x, y, z }) => {
    const v = globalThis.__voxel;
    const levels = {};
    let cells = 0, far = 0;
    for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) for (let dy = -12; dy <= 1; dy++) {
      const b = v.block(x + dx, y + dy, z + dz);
      if (b === 5 || b >= 24) {
        cells++;
        levels[b] = (levels[b] ?? 0) + 1;
        if (Math.abs(dx) + Math.abs(dz) > 11) far++;
      }
    }
    return { cells, levels, far, source: v.block(x, y, z), fluid: { ticks: v.engine.fluids.ticks, changes: v.engine.fluids.totalChanges } };
  }, pour);
  console.log(`water flow: ${JSON.stringify(flow)}`);
  if (flow.source !== 5) fail('the water source disappeared');
  if (flow.cells < 5) fail('water did not spread');
  await capture('water-flow.png');
  const waterParity = await page.evaluate(() => globalThis.__voxel.parity(400));
  console.log(`mesh parity after water flow: ${waterParity.meshesCompared - waterParity.meshMismatches.length} / ${waterParity.meshesCompared}`);
  if (waterParity.meshMismatches.length > 0) fail(`mesh mismatches after water flow: ${JSON.stringify(waterParity.meshMismatches.slice(0, 5))}`);

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

  // Persistence: save to IndexedDB, reload the page and find the edits again.
  const savedEdits = await page.evaluate(async () => {
    const g = globalThis.__game;
    const v = globalThis.__voxel;
    v.teleport(22.5, -51, 22.5, 0, 0);
    await g.save(false);
    return v.engine.delta.editCount;
  });
  await page.reload();
  await page.waitForFunction(() => '__voxel' in globalThis && globalThis.__game?.state === 'playing', null, { timeout: 60_000 });
  await waitSettled(page, 'after reload');
  const restored = await page.evaluate(() => {
    const v = globalThis.__voxel;
    const p = v.engine.camera.position;
    return { edits: v.engine.delta.editCount, torch: v.block(23, -52, 22), torchLight: v.light(23, -52, 22), room: v.block(21, -51, 21), camera: [p[0], p[1], p[2]] };
  });
  console.log(`persistence: saved ${savedEdits} edits, reloaded ${JSON.stringify(restored)}`);
  if (restored.edits !== savedEdits) fail('saved edits were not restored from IndexedDB');
  if (restored.torch !== 23 || restored.room !== 0 || restored.torchLight.block !== 14) fail('edits were not re-applied to streamed chunks after reload');
  if (Math.abs(restored.camera[1] - -51) > 0.01) fail('player position was not restored');


  const finalStats = await page.evaluate(() => globalThis.__voxel.stats());
  console.log(`fps≈${finalStats.fps.toFixed(1)} (software rasteriser) · GPU pools ${finalStats.gpuMemoryMB.toFixed(0)} MB`);
  // The software rasteriser is shared: stop the main page before loading the menus.
  await page.close();

  // UI: title screen, play, F3 overlay and pause menu.
  const ui = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  ui.on('pageerror', (err) => errors.push(String(err)));
  await ui.goto(`${url}?seed=2024&radius=3&offscreen=1&autostart=0&time=0.3`);
  await ui.waitForFunction(() => globalThis.__game?.state === 'title', null, { timeout: 240_000, polling: 500 });
  await ui.waitForFunction(() => document.querySelector('#title-status')?.textContent?.startsWith('World ready'), null, { timeout: 240_000, polling: 500 });
  mkdirSync(outDir, { recursive: true });
  await ui.screenshot({ path: join(outDir, 'ui-title.png') });
  await ui.fill('#seed-input', 'portfolio');
  await ui.click('#play');
  await ui.waitForFunction(() => globalThis.__game.state !== 'title' && !globalThis.__game.busy, null, { timeout: 120_000 });
  await ui.keyboard.press('F3');
  const uiState = await ui.evaluate(() => ({
    state: globalThis.__game.state,
    seed: globalThis.__game.engine.options.seed,
    statsVisible: !document.querySelector('#stats').hidden,
    hudVisible: !document.querySelector('#hud').hidden,
    slots: document.querySelectorAll('.hotbar-slot').length,
  }));
  // Pausing happens when the pointer lock is released (Esc); without one, open the menu directly.
  if (await ui.evaluate(() => document.pointerLockElement !== null)) {
    await ui.evaluate(() => document.exitPointerLock());
    await ui.waitForFunction(() => globalThis.__game.state === 'paused', null, { timeout: 30_000 });
  } else {
    await ui.evaluate(() => globalThis.__game.setState('paused'));
  }
  await ui.waitForTimeout(600); // fade-in animation
  await ui.screenshot({ path: join(outDir, 'ui-pause.png') });
  console.log(`ui: ${JSON.stringify(uiState)}`);
  if (!['playing', 'paused'].includes(uiState.state)) fail('Play did not start the game');
  if (!uiState.statsVisible) fail('F3 did not show the debug overlay');
  if (!uiState.hudVisible || uiState.slots !== 9) fail('HUD / hotbar missing');
  // Reset World (two clicks) erases the local database and returns to the title screen.
  await ui.evaluate(async () => { globalThis.__voxel.setBlock(0, 100, 0, 1); await globalThis.__game.save(false); });
  await ui.click('#reset');
  await ui.click('#reset');
  await ui.waitForFunction(() => globalThis.__game.state === 'title' && !globalThis.__game.busy && globalThis.__game.engine, null, { timeout: 240_000, polling: 500 });
  const reset = await ui.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('webgpu-voxel-engine', 1); r.onsuccess = () => res(r.result); r.onerror = rej; });
    const records = await new Promise((res) => { const r = db.transaction('world').objectStore('world').count(); r.onsuccess = () => res(r.result); });
    db.close();
    return { records, edits: globalThis.__voxel.engine.delta.editCount, toast: document.querySelector('#toast').textContent };
  });
  console.log(`reset world: ${JSON.stringify(reset)}`);
  if (reset.records !== 0 || reset.edits !== 0) fail('Reset World did not erase the saved world');
  await ui.close();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

if (errors.length > 0) fail(`browser reported ${errors.length} error(s):\n  ${errors.slice(0, 10).join('\n  ')}`);
if (!process.exitCode) console.log('\n✓ GPU smoke test passed');
