import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as T from 'three';
const out = process.env.MAP_EVIDENCE || 'evidence/m23-smooth-wasd';
const url = process.env.MAP_URL || 'http://127.0.0.1:4183';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: [] });
const checks = [], errors = [], traces = {};
const check = (name, fn = () => {}) => { fn(); checks.push({ name, pass: true }); };
const camera = page => page.evaluate(() => window.__map.snapshot().camera);
const delta = (a, b) => new T.Vector3(...b.target).sub(new T.Vector3(...a.target));
const same = (a, b, tolerance = .003) => a.position.concat(a.target).forEach((n, i) => assert(Math.abs(n - b.position.concat(b.target)[i]) < tolerance));
const speeds = frames => frames.slice(1).map((f, i) => ({ time: f.time, dt: (f.time - frames[i].time) / 1000, speed: delta(frames[i].camera, f.camera).length() / ((f.time - frames[i].time) / 1000) })).filter(f => f.dt > .005 && f.dt < .09);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', route => route.fulfill({ json: { chat: { configured: true }, access: { allowed: true }, knowledge: { configured: false } } }));
async function closeAssistant() { if (await page.getByRole('button', { name: 'Close assistant' }).isVisible()) await page.getByRole('button', { name: 'Close assistant' }).click(); await page.locator('#map canvas').focus(); }
async function reset() { await closeAssistant(); await page.evaluate(() => window.__map.reset()); await page.mouse.move(5, 5); await page.waitForTimeout(350); }
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__map?.snapshot().status === 'ready', null, { timeout: 90000 });
  check('Real production assets load automatically and map is enabled', () => {}); assert.equal(await page.locator('#app').evaluate(x => x.inert), false);
  await reset(); const initial = await camera(page);
  // Begin tracing before keydown so acceleration is observed from its first frame.
  await page.evaluate(() => { window.__wasdFrames = []; window.__wasdTrace = true; const record = time => { if (!window.__wasdTrace) return; window.__wasdFrames.push({ rafTime: time, time: performance.now(), camera: window.__map.snapshot().camera }); requestAnimationFrame(record); }; requestAnimationFrame(record); });
  await page.waitForTimeout(100); const downAt = await page.evaluate(() => performance.now()); await page.keyboard.down('w'); await page.waitForTimeout(1000);
  const upAt = await page.evaluate(() => performance.now()); await page.keyboard.up('w'); await page.waitForTimeout(550);
  const frames = await page.evaluate(() => { window.__wasdTrace = false; return window.__wasdFrames; });
  const held = frames.filter(f => f.time >= downAt && f.time < upAt), release = frames.filter(f => f.time >= upAt);
  const startSpeeds = speeds(held), releaseSpeeds = speeds(release);
  traces.w = { downAt, upAt, frames, startSpeeds, releaseSpeeds };
  check('rAF camera trace shows gradual acceleration and a short decelerating release', () => {
    assert(startSpeeds.length >= 8 && releaseSpeeds.length >= 5, 'Insufficient usable rendering frames');
    const early = startSpeeds.slice(0, 2).reduce((a, b) => a + b.speed, 0) / 2;
    const cruise = startSpeeds.slice(-4).reduce((a, b) => a + b.speed, 0) / 4;
    assert(early > 0 && early < cruise * .75, `Early${early} cruise${cruise}`);
    assert(releaseSpeeds[0].speed > 0 && releaseSpeeds[0].speed < cruise);
    assert(releaseSpeeds.slice(-3).every(s => s.speed < .005));
    const releaseWindows = [0, 80, 160].map(ms => { const samples = releaseSpeeds.filter(s => s.time - upAt >= ms && s.time - upAt < ms + 80); assert(samples.length >= 2); return samples.reduce((sum, s) => sum + s.speed, 0) / samples.length; });
    traces.w.releaseWindowSpeeds = releaseWindows;
    for (let i = 1; i < releaseWindows.length; i++) assert(releaseWindows[i] < releaseWindows[i - 1]);
  });
  check('W movement and its braking tail preserve height, zoom and orientation', () => {
    const offset = initial.position.map((n, i) => n - initial.target[i]);
    for (const f of frames) { f.camera.position.map((n, i) => n - f.camera.target[i]).forEach((n, i) => assert(Math.abs(n - offset[i]) < .003)); assert(Math.abs(f.camera.target[1] - initial.target[1]) < .003); }
    assert(delta(initial, frames.at(-1).camera).length() > 30);
  });
  const settled = await camera(page); await page.waitForTimeout(300); same(settled, await camera(page)); check('Released camera fully settles and stays still', () => {});
  await page.screenshot({ path: `${out}/smooth-wasd-overview.png` });
  await reset(); await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w');
  const afterSuspension = await page.evaluate(() => { const start = performance.now(); while (performance.now() - start < 400) {} return new Promise(resolve => requestAnimationFrame(() => resolve(window.__map.snapshot().camera))); });
  await page.waitForTimeout(350); same(afterSuspension, await camera(page)); check('A400ms suspended frame expires released travel with no renewed tail', () => {});
  for (const code of ['s', 'a', 'd']) {
    await reset(); const before = await camera(page), offset = before.position.map((n, i) => n - before.target[i]); await page.keyboard.down(code); await page.waitForTimeout(500); await page.keyboard.up(code); await page.waitForTimeout(350); const after = await camera(page);
    const forward = new T.Vector3(-offset[0], 0, -offset[2]).normalize(), right = new T.Vector3(-forward.z, 0, forward.x), axis = code === 's' ? forward : right;
    check(`Real${code.toUpperCase()} input retains camera-relative direction and zoom`, () => { assert(delta(before, after).dot(axis) * (code === 'd' ? 1 : -1) > 1); after.position.map((n, i) => n - after.target[i]).forEach((n, i) => assert(Math.abs(n - offset[i]) < .003)); });
  }
  await reset(); await page.keyboard.down('w'); await page.waitForTimeout(300); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); const blurred = await camera(page); await page.waitForTimeout(350); same(blurred, await camera(page)); await page.keyboard.up('w'); check('Blur immediately clears held motion', () => {});
  await reset(); await page.keyboard.down('w'); await page.waitForTimeout(250); await page.getByRole('button', { name: 'Open campus assistant' }).click(); const input = page.locator('#campus-assistant-message'); await input.focus(); const typing = await camera(page); await page.keyboard.up('w'); await page.keyboard.type('wasd WASD'); await page.waitForTimeout(350); same(typing, await camera(page)); assert.equal(await input.inputValue(), 'wasd WASD'); check('Assistant focus stops held travel and WASD typing stays in the input', () => {});
  await reset(); const original = await camera(page); await page.keyboard.down('w'); await page.waitForTimeout(250); await page.evaluate(() => window.__map.reset()); const resetView = await camera(page); same(original, resetView); await page.keyboard.down('w'); await page.waitForTimeout(350); same(resetView, await camera(page)); await page.keyboard.up('w'); check('Reset takes over exactly and repeated held key cannot restart it', () => {});
  await page.keyboard.down('d'); await page.waitForTimeout(250); await page.evaluate(pose => window.__map.restoreCamera(pose), original); const restored = await camera(page); same(original, restored); await page.waitForTimeout(350); same(restored, await camera(page)); await page.keyboard.up('d'); check('External camera restoration clears held movement and all tail', () => {});
  await reset(); const base = await page.evaluate(() => window.__map.snapshot()), stern = base.landmarks.find(x => x.id === 'stern-school-of-business');
  // Hit Gould's actual ground rather than selecting through the debug API.
  const plaza = stern.parts.find(x => x.name === 'nyu-gould-plaza'); let hit;
  for (const fx of [.25, .45, .6, .75]) {
    for (const fz of [.2, .4, .6, .8]) {
      const c = await camera(page), cam = new T.PerspectiveCamera(c.fov, 1440 / 1000, c.near, c.far); cam.position.fromArray(c.position); cam.lookAt(new T.Vector3(...c.target)); cam.updateMatrixWorld(true);
      const point = new T.Vector3(plaza.bounds.min[0] + (plaza.bounds.max[0] - plaza.bounds.min[0]) * fx, 1, plaza.bounds.min[2] + (plaza.bounds.max[2] - plaza.bounds.min[2]) * fz).project(cam), x = (point.x + 1) * 720, y = (1 - point.y) * 500;
      if (x < 0 || x > 1440 || y < 0 || y > 1000) continue;
      await page.mouse.move(x, y); await page.waitForTimeout(180); if ((await page.evaluate(() => window.__map.snapshot())).hovered === stern.id) { hit = { x, y }; break; }
    } if (hit) break;
  }
  assert(hit, 'No actual Gould hover hit'); await page.waitForTimeout(600); const lifted = (await page.evaluate(() => window.__map.snapshot())).landmarks.find(x => x.id === stern.id);
  check('Actual Gould hover lifts merged Stern/plaza equally while preserving horizontal alignment', () => {
    const shifts = lifted.parts.map((p, i) => p.bounds.min[1] - stern.parts[i].bounds.min[1]); assert(shifts[0] > 3); assert(Math.abs(shifts[0] - shifts[1]) < .01);
    lifted.parts.forEach((p, i) => { for (const axis of [0, 2]) { assert(Math.abs(p.bounds.min[axis] - stern.parts[i].bounds.min[axis]) < .002); assert(Math.abs(p.bounds.max[axis] - stern.parts[i].bounds.max[axis]) < .002); } });
  });
  await page.keyboard.down('w'); await page.waitForTimeout(100); await page.mouse.click(hit.x, hit.y); await page.keyboard.up('w'); await page.waitForTimeout(1800); const focused = await page.evaluate(() => window.__map.snapshot()); assert.equal(focused.selected, stern.id); const focus = await camera(page); await page.waitForTimeout(400); same(focus, await camera(page), .01); check('Real plaza click takes over held WASD and settles at Stern focus', () => {});
  await page.screenshot({ path: `${out}/stern-gould-focus.png` });
  await page.getByRole('button', { name: 'Open campus assistant' }).click(); const modalPose = await camera(page); await page.keyboard.down('d'); await page.waitForTimeout(200); const panel = await page.locator('#campus-assistant-panel').boundingBox(); await page.mouse.move(panel.x + panel.width / 2, panel.y + 100); await page.mouse.wheel(0, 500); await page.keyboard.up('d'); await page.waitForTimeout(450); assert.equal((await page.evaluate(() => window.__map.snapshot())).selected, stern.id); same(modalPose, await camera(page), .01); check('Native assistant modal blocks typing and focused outward wheel from moving the map', () => {}); await closeAssistant(); await page.mouse.move(500, 500); await page.mouse.wheel(0, 500); await page.waitForTimeout(1800); const returned = await camera(page); check('Closing assistant restores outward-wheel map navigation', () => { const offset = new T.Vector3(...returned.position).sub(new T.Vector3(...returned.target)); const polar = Math.acos(offset.y / offset.length()); assert(polar <= base.navigation.cameraLimits.maxPolarAngle + .002); });
  check('No uncaught JavaScript errors', () => assert.deepEqual(errors, []));
  await fs.writeFile(`${out}/browser-results.json`, JSON.stringify({ checks, errors, traces, plazaHit: hit, viewport: { width: 1440, height: 1000 }, url, limitations: ['Installed Chrome with default graphics backend; these traces do not establish subjective physical keyboard feel or other hardware performance.', 'API status intercepted locally; no real model/backend calls.', 'Map assets and camera input are real.'] }, null, 2) + '\n');
  console.log(`${checks.length}/${checks.length} smooth/faster WASD Chrome checks passed`);
} catch (error) {
  await fs.writeFile(`${out}/browser-failure.json`, JSON.stringify({ message: error.message, stack: error.stack, checks, errors, traces }, null, 2) + '\n'); await page.screenshot({ path: `${out}/browser-failure.png` }); throw error;
} finally { await browser.close(); }
