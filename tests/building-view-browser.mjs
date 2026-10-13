import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPaulsonModel } from '../src/paulson.js';

const url = process.env.MAP_URL ?? 'http://127.0.0.1:5173';
const out = process.env.MAP_EVIDENCE ?? 'evidence/m19-building-views';
fs.mkdirSync(out, { recursive: true });
// Independent acceptance contract from the screenshot estimates supplied to
// implementation. Percentage means lower vertical offset in the Y-up map.
const views = [
  ['stern-school-of-business', 117, 65, .75],
  ['courant-institute', 15, 63, .8],
  ['bobst-library', 175, 62, .8],
  ['nyu-kimmel-center', 117, 65, .8],
  ['nyu-global-center', 181, 53, .8],
  ['nyu-john-a-paulson-center', 110, 46, .8],
  ['nyu-leslie-elab-building', 189, 41, .8],
  ['nyu-silver-center', 197, 60, .8],
];
const paulsonMetadata = JSON.parse(fs.readFileSync('campus-assets/data/extracted-buildings.json', 'utf8')).buildings['nyu-john-a-paulson-center'];
const report = { environment: { url, chrome: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true }, checks: [], console: [], errors: [], failedRequests: [], responses: [], limitations: ['Screenshot azimuths and original polar angles are estimates; exact pixel reconstruction cannot be established from the provided images.', 'Runs an isolated installed Chrome instance, not the existing user Chrome tab.', 'Mouse wheel is real browser input; document-target wheel and gesture tails are synthetic. Touch and physical trackpad hardware are not exercised.'] };
const browser = await chromium.launch({ executablePath: report.environment.chrome, headless: true });
report.environment.version = browser.version();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('console', m => report.console.push({ type: m.type(), text: m.text().slice(0, 500) }));
page.on('pageerror', e => report.errors.push(e.message));
page.on('requestfailed', r => report.failedRequests.push({ url: r.url(), failure: r.failure() }));
page.on('response', r => { if (r.status() >= 400) report.responses.push({ url: r.url(), status: r.status() }); });
// Avoid a live configured backend/model call; assistant UI remains operational.
await page.route('**/api/status', r => r.fulfill({ json: { chat: { configured: false }, access: { allowed: false } } }));
const snap = () => page.evaluate(() => window.__map.snapshot());
const settle = () => page.waitForTimeout(1700);
const closeAssistant = async () => { if (await page.locator('.assistant-panel').isVisible()) await page.getByRole('button', { name: 'Close assistant', exact: true }).click(); };
const reset = async () => { await closeAssistant(); await page.mouse.move(5, 5); await page.evaluate(() => window.__map.reset()); await settle(); };
const focus = async id => { await page.evaluate(id => { window.__map.select(id); window.__map.focus(); }, id); await settle(); };
function sameCamera(a, b, tolerance = .005) { for (const key of ['position', 'target']) for (let i = 0; i < 3; i++) assert(Math.abs(a[key][i] - b[key][i]) < tolerance, `${key}[${i}]: ${a[key][i]} vs ${b[key][i]}`); }
async function check(name, fn) { console.log('CHECK ' + name); try { report.checks.push({ name, pass: true, detail: await fn() }); } catch (e) { report.checks.push({ name, pass: false, error: e.stack }); console.log('FAIL ' + e.message); } }
function poseAndProjection(snapshot, id) {
  const landmark = snapshot.landmarks.find(x => x.id === id), pose = snapshot.camera;
  const camera = new THREE.PerspectiveCamera(pose.fov, pose.aspect ?? report.viewport.width / report.viewport.height, pose.near, pose.far);
  camera.zoom = pose.zoom; camera.position.fromArray(pose.position); camera.lookAt(new THREE.Vector3().fromArray(pose.target)); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const projected = [];
  for (const x of [landmark.bounds.min[0], landmark.bounds.max[0]]) for (const y of [landmark.bounds.min[1], landmark.bounds.max[1]]) for (const z of [landmark.bounds.min[2], landmark.bounds.max[2]]) projected.push(new THREE.Vector3(x, y, z).project(camera).toArray());
  let occupiedExtents;
  // Paulson's unequal-height towers leave upper AABB corners empty. Project
  // actual mesh vertices, after verifying the same geometry is loaded, so a
  // fictitious high corner does not create a portrait clipping false positive.
  if (id === 'nyu-john-a-paulson-center') {
    const root = createPaulsonModel(paulsonMetadata); root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root); for (const key of ['min', 'max']) bounds[key].toArray().forEach((v, i) => assert(Math.abs(v - landmark.bounds[key][i]) < .001));
    occupiedExtents = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; let triangles = 0;
    root.traverse(mesh => { if (!mesh.isMesh) return; const positions = mesh.geometry.attributes.position; triangles += (mesh.geometry.index?.count ?? positions.count) / 3; for (let i = 0; i < positions.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera).toArray(); for (let k = 0; k < 3; k++) { occupiedExtents.min[k] = Math.min(occupiedExtents.min[k], v[k]); occupiedExtents.max[k] = Math.max(occupiedExtents.max[k], v[k]); } } mesh.geometry.dispose(); });
    assert.equal(triangles, landmark.triangles);
  }
  return { pose, bounds: landmark.bounds, meshes: landmark.meshes, triangles: landmark.triangles, projected, occupiedExtents };
}
const framed = result => (result.occupiedExtents ? [result.occupiedExtents.min, result.occupiedExtents.max] : result.projected).every(([x, y, z]) => Math.abs(x) < 1 && Math.abs(y) < 1 && Math.abs(z) < 1);
function framingContract(result, id) {
  const size = result.bounds.max.map((v, i) => v - result.bounds.min[i] + (i === 1 ? 9 : 0));
  const vertical = Math.atan(Math.tan(result.pose.fov * Math.PI / 360) / result.pose.zoom);
  const halfFov = Math.min(vertical, Math.atan(Math.tan(vertical) * report.viewport.width / report.viewport.height));
  const limits = report.initial.navigation.cameraLimits;
  const expected = Math.min(limits.maxDistance, Math.max(limits.minDistance, Math.hypot(...size) / 2 / Math.sin(halfFov) * 1.12 * (['bobst-library','nyu-silver-center'].includes(id) ? 1.2 : 1)));
  const distance = Math.hypot(...result.pose.position.map((v, i) => v - result.pose.target[i]));
  assert(Math.abs(distance - expected) < .005, 'Original full-building focus zoom changed');
  if (id !== 'stern-school-of-business') return assert(framed(result), 'Building frame is clipped');
  // Keep the chosen rotunda target, with the original full-building zoom.
  result.pose.target.forEach((v, i) => assert(Math.abs(v - [85, 25, 193][i]) < .001));
  const original = report.initial.landmarks.find(x => x.id === id); assert.equal(result.meshes, original.meshes); assert.equal(result.triangles, original.triangles);
  result.framing = 'Rotunda target with original full-building zoom distance.';
}
try {
  const start = Date.now(); await page.goto(url);
  await page.waitForFunction(() => window.__map?.snapshot().status === 'ready', null, { timeout: 120000 });
  report.loadMs = Date.now() - start;
  await check('Map opens automatically without an entry screen or failed assets', async () => { assert.equal((await snap()).failed.length, 0); assert.equal(report.errors.length, 0); assert.equal(report.failedRequests.length, 0); assert.equal(await page.locator('#loading-screen').count(), 0);assert.equal(await page.locator('#loading-enter').count(), 0); assert.equal(await page.locator('#app').evaluate(e => e.inert), false); return { loadMs: report.loadMs, loaded: (await snap()).loaded }; });
  await closeAssistant(); report.viewport = { width: 1440, height: 1000 }; report.initial = await snap();
  await page.screenshot({ path: `${out}/overview-landscape.png` });
  for (const [id, azimuth, polar, scale] of views) await check('Landscape screenshot view and lowered camera: ' + id, async () => {
    await reset(); await focus(id); const state = await snap(); assert.equal(state.selected, id);
    const offset = state.camera.position.map((n, i) => n - state.camera.target[i]);
    const theta = Math.atan2(offset[0], offset[2]) * 180 / Math.PI, delta = Math.atan2(Math.sin((theta - azimuth) * Math.PI / 180), Math.cos((theta - azimuth) * Math.PI / 180));
    assert(Math.abs(delta) < 1e-5); assert(Math.abs(offset[1] / Math.hypot(offset[0], offset[2]) - scale / Math.tan(polar * Math.PI / 180)) < 1e-5);
    const result = poseAndProjection(state, id); await page.screenshot({ path: `${out}/${id}-landscape.png` }); framingContract(result, id); return result;
  });
  for (const target of ['launcher', 'assistant', 'canvas', 'document']) await check('Outward scroll returns saved overview over ' + target, async () => {
    await reset(); const before = (await snap()).camera; await focus('bobst-library');
    let point;
    if (target === 'assistant') { await page.getByRole('button', { name: 'Open campus assistant', exact: true }).click(); point = await page.locator('.assistant-transcript').boundingBox(); }
    else if (target === 'launcher') point = await page.locator('.assistant-launcher').boundingBox();
    else point = { x: 600, y: 350, width: 100, height: 100 };
    if (target === 'document') await page.evaluate(() => document.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 })));
    else { await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2); await page.mouse.wheel(0, 120); }
    await settle(); const after = await snap(); sameCamera(after.camera, before); assert.equal(after.selected, 'bobst-library');
    if (target === 'assistant') await page.screenshot({ path: `${out}/assistant-outward-return.png` }); return { before, after: after.camera };
  });
  await check('Inactive and inward overlay wheel remain native; focused return consumes tails once', async () => {
    await reset(); const overview = (await snap()).camera;
    const wheel = delta => page.locator('.assistant-launcher').evaluate((el, deltaY) => { const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; }, delta);
    assert.equal(await wheel(25), false); await settle(); sameCamera((await snap()).camera, overview);
    await focus('courant-institute'); const focused = (await snap()).camera; assert.equal(await wheel(-25), false); assert.equal(await wheel(0), false); await settle(); sameCamera((await snap()).camera, focused);
    assert.equal(await wheel(25), true); for (let i = 0; i < 8; i++) { await page.waitForTimeout(70); assert.equal(await wheel(.1), true); } await settle(); sameCamera((await snap()).camera, overview);
    assert.equal(await wheel(1), false); return { overview, focused };
  });
  await check('Actual canvas hover/click moves complete building geometry together', async () => {
    await reset(); await focus('courant-institute'); const initial = await snap(), id = 'courant-institute', center = initial.landmarks.find(x => x.id === id).screen;
    let hit;
    for (const [dx, dy] of [[0, 0], [0, 30], [-30, 0], [30, 0], [0, -30]]) { await page.mouse.move(center.x + dx, center.y + dy); await page.waitForTimeout(200); if ((await snap()).hovered === id) { hit = { x: center.x + dx, y: center.y + dy }; break; } }
    assert(hit, 'No actual canvas hover hit'); await page.waitForTimeout(500); const lifted = (await snap()).landmarks.find(x => x.id === id), base = initial.landmarks.find(x => x.id === id); const lift = lifted.bounds.min[1] - base.bounds.min[1]; assert(lift > 0); assert(Math.abs(lift - (lifted.bounds.max[1] - base.bounds.max[1])) < .01); assert.equal(lifted.triangles, base.triangles); assert.equal(lifted.meshes, base.meshes);
    await page.mouse.click(hit.x, hit.y); await settle(); assert.equal((await snap()).selected, id); await page.mouse.move(5, 5); await settle(); return { hit, lift, meshes: base.meshes, triangles: base.triangles };
  });
  await page.setViewportSize({ width: 390, height: 844 }); report.viewport = { width: 390, height: 844 }; await settle();
  for (const [id] of views) await check('Portrait building frame and camera bounds: ' + id, async () => {
    await reset(); await focus(id); const state = await snap(), result = poseAndProjection(state, id), limits = state.navigation.cameraLimits, distance = Math.hypot(...state.camera.position.map((v, i) => v - state.camera.target[i]));
    report.portraitMeasurements ??= {}; report.portraitMeasurements[id] = { ...result, distance };
    await page.screenshot({ path: `${out}/${id}-portrait.png` });
    assert(distance <= limits.maxDistance + 1e-4); assert(distance >= limits.minDistance - 1e-4); framingContract(result, id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390); return { ...result, distance };
  });
  report.final = await snap(); report.performance = await page.evaluate(() => window.__map.performance());
} catch (e) { report.fatal = e.stack; }
finally { await browser.close(); fs.writeFileSync(`${out}/browser-results.json`, JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ checks: report.checks.map(({ name, pass, error }) => ({ name, pass, error })), loadMs: report.loadMs, errors: report.errors, failedRequests: report.failedRequests, fatal: report.fatal }, null, 2));
if (report.fatal || report.checks.some(c => !c.pass)) process.exitCode = 1;
