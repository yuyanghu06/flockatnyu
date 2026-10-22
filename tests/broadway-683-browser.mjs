import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = process.env.MAP_EVIDENCE ?? 'evidence/683-broadway';
const url = process.env.MAP_URL ?? 'http://127.0.0.1:5173';
await fs.mkdir(out, { recursive: true });
const main = await fs.readFile('src/main.js', 'utf8');
const lineNumber = main.split('\n').findIndex(line => line.includes("Object.defineProperty(window, '__map'"));
assert(lineNumber > 0);
const report = { url, checks: [], errors: [], failedRequests: [], badResponses: [], requests: [], limitations: ['Isolated installed headless Chrome; mobile viewport emulation, no physical touch device.', 'Read-only debugger captures the actual Three scene; no application source instrumentation.', 'All /api/** requests intercepted; no real source reads or model calls.', 'Map Escape return is not implemented in existing product; Reset and outward wheel are the supported return paths.'] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
report.chrome = browser.version();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(8000);
page.on('request', r => report.requests.push(r.url()));
page.on('pageerror', e => report.errors.push(e.message));
page.on('requestfailed', r => report.failedRequests.push({ url: r.url(), error: r.failure() }));
page.on('response', r => { if (r.status() >= 400) report.badResponses.push({ url: r.url(), status: r.status() }); });
await page.route('**/api/**', r => r.fulfill({ json: { chat: { configured: false }, access: { allowed: false } } }));
const cdp = await context.newCDPSession(page);
await cdp.send('Debugger.enable');
await cdp.send('Debugger.setBreakpointByUrl', { urlRegex: '/src/main\\.js(?:\\?|$)', lineNumber });
let captured = false, captureError;
cdp.on('Debugger.paused', async event => {
  try {
    const value = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: event.callFrames[0].callFrameId, expression: 'globalThis.__broadwayProbe={scene,roots,pickMeshes,camera,renderer,THREE,landmarkEffects}; true', returnByValue: true });
    if (value.exceptionDetails) throw Error(value.exceptionDetails.text);
    captured = true;
  } catch (e) { captureError = e.message; } finally { await cdp.send('Debugger.resume'); }
});
const snap = () => page.evaluate(() => window.__map.snapshot());
const settle = () => page.waitForTimeout(1900);
const sameCamera = (a, b) => { for (const k of ['position', 'target']) a[k].forEach((v, i) => assert(Math.abs(v - b[k][i]) < .01, k + i)); };
const check = async (name, fn) => {
  try { const data = await fn(); report.checks.push({ name, pass: true, data }); console.log('PASS ' + name); }
  catch (e) { report.checks.push({ name, pass: false, error: e.stack }); console.log('FAIL ' + name + ': ' + e.message); }
};
const probe = () => page.evaluate(() => {
  const p = window.__broadwayProbe, root = p.roots.get('683-broadway');
  p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
  const meshes = []; root.traverse(m => { if (m.isMesh && !m.userData.mapDecoration) meshes.push({ name: m.name, id: m.uuid, geometry: m.geometry.uuid, triangles: (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, parent: m.parent.uuid, matrix: m.matrixWorld.toArray(), pickable: p.pickMeshes.includes(m) }); });
  const overlay = p.scene.children.find(n => n.name === 'Landmark glow 683-broadway');
  const overlays = overlay?.children.map(m => ({ geometry: m.geometry.uuid, matrix: m.matrixWorld.toArray(), color: m.material.color.getHexString(), opacity: m.material.opacity })) ?? [];
  const box = new p.THREE.Box3().setFromObject(root), projected = [];
  root.traverse(m => { if (!m.isMesh || m.userData.mapDecoration) return; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { const v = new p.THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).project(p.camera); projected.push(v.toArray()); } });
  return { meshes, overlays, effects: p.landmarkEffects.snapshot(), rootId: root.uuid, roots: [...p.roots.keys()], sameIdRoots: p.scene.children.filter(n => n.userData.buildingId === '683-broadway' && !n.userData.mapDecoration).length, bounds: { min: box.min.toArray(), max: box.max.toArray() }, projectedMin: [0, 1, 2].map(k => Math.min(...projected.map(v => v[k]))), projectedMax: [0, 1, 2].map(k => Math.max(...projected.map(v => v[k]))) };
});
const hitPoints = () => page.evaluate(() => {
  const p = window.__broadwayProbe, root = p.roots.get('683-broadway'), ray = new p.THREE.Raycaster(), box = new p.THREE.Box3().setFromObject(root), points = [];
  p.scene.updateMatrixWorld(true); p.camera.updateMatrixWorld(true);
  for (const fx of [.2, .4, .6, .8]) for (const fy of [.3, .6, .9]) for (const fz of [.2, .4, .6, .8]) {
    const v = new p.THREE.Vector3(box.min.x + (box.max.x - box.min.x) * fx, box.min.y + (box.max.y - box.min.y) * fy, box.min.z + (box.max.z - box.min.z) * fz).project(p.camera);
    if (Math.abs(v.x) > .94 || Math.abs(v.y) > .94) continue;
    ray.setFromCamera(new p.THREE.Vector2(v.x, v.y), p.camera);
    const hit = ray.intersectObjects(p.pickMeshes, false)[0]; let n = hit?.object;
    while (n && !n.userData.buildingId) n = n.parent;
    if (n?.userData.buildingId === '683-broadway') points.push({ x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2, mesh: hit.object.name });
  }
  return points;
});
async function verifyDisabled() {
  const off = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await off.newPage(), requests = [], errors = [], failures = [];
  p.on('request', r => requests.push(r.url())); p.on('pageerror', e => errors.push(e.message));
  p.on('requestfailed', r => failures.push(r.url()));
  p.on('response', r => { if (r.status() >= 400) failures.push(r.url() + ':' + r.status()); });
  await p.route('**/api/**', r => r.fulfill({ json: { chat: { configured: false }, access: { allowed: false } } }));
  let switches = 0;
  await p.route(/\/src\/go-greek-popup\.js(?:\?|$)/, async route => {
    const response = await route.fetch(), original = await response.text();
    assert.equal((original.match(/\benabled:\s*true\b/g) ?? []).length, 1);
    switches++; await route.fulfill({ response, body: original.replace(/\benabled:\s*true\b/, 'enabled: false') });
  });
  const debug = await off.newCDPSession(p); await debug.send('Debugger.enable');
  await debug.send('Debugger.setBreakpointByUrl', { urlRegex: '/src/main\\.js(?:\\?|$)', lineNumber });
  let capturedOff = false, offCaptureError;
  debug.on('Debugger.paused', async event => {
    try {
      const value = await debug.send('Debugger.evaluateOnCallFrame', { callFrameId: event.callFrames[0].callFrameId, expression: 'globalThis.__offProbe={scene,roots,pickMeshes,camera,renderer,THREE,landmarkEffects}; true', returnByValue: true });
      if (value.exceptionDetails) throw Error(value.exceptionDetails.text); capturedOff = true;
    } catch (e) { offCaptureError = e.message; } finally { await debug.send('Debugger.resume'); }
  });
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__map?.snapshot().status === 'ready' && document.querySelector('#app').dataset.state === 'entered', null, { timeout: 120000 });
    assert(capturedOff, offCaptureError ?? 'Disabled scene not captured'); await debug.send('Debugger.disable');
    if (await p.getByRole('button', { name: 'Close assistant', exact: true }).isVisible()) await p.getByRole('button', { name: 'Close assistant', exact: true }).click();
    assert.equal(switches, 1, 'One actual manifest governs the complete module graph');
    const s = await p.evaluate(() => window.__map.snapshot());
    assert.equal(s.landmarks.length, 9); assert(!s.landmarks.some(l => l.id === '683-broadway'));
    assert.equal(s.removedBroadway683Triangles ?? 0, 0); assert.deepEqual(s.failed, []);
    assert.equal(await p.locator('option[value="683-broadway"]').count(), 0);
    const disabled = await p.evaluate(async () => {
      const { buildingViews } = await import('/src/building-views.js'), { buildings } = await import('/src/config.js');
      const { goGreekPopup } = await import('/src/go-greek-popup.js');
      const q = window.__offProbe;
      q.landmarkEffects.setActive('683-broadway', '683-broadway');
      const effects = q.landmarkEffects.snapshot();
      const rootIds = []; q.scene.traverse(n => { if (n.userData.buildingId === '683-broadway') rootIds.push(n.uuid); });
      const pickIds = q.pickMeshes.flatMap(m => { const ids = []; for (let n = m; n; n = n.parent) if (n.userData.buildingId === '683-broadway') ids.push(n.uuid); return ids; });
      window.__map.select('683-broadway'); window.__map.focus();
      return { enabled: goGreekPopup.enabled, view: buildingViews['683-broadway'] ?? null, buildings: buildings.map(b => ({ id: b.id, name: b.name })), rootIds, pickIds, effects, selected: window.__map.snapshot().selected };
    });
    assert.equal(disabled.enabled, false); assert.equal(disabled.view, null); assert.equal(disabled.buildings.length, 9);
    assert(!disabled.buildings.some(b => b.id === '683-broadway' || b.name === 'Go Greek'));
    assert.deepEqual(disabled.rootIds, []); assert.deepEqual(disabled.pickIds, []); assert.equal(disabled.selected, null);
    assert.equal(disabled.effects.activeId, null); assert.equal(disabled.effects.selectedId, null); assert.equal(disabled.effects.ringMeshes, 0); assert.equal(disabled.effects.outline.proxyCount, 0);
    assert.equal(await p.locator('.map-presence__building-card h2').count(), 0);
    const tileUrl = requests.find(u => /\/tile-1_1\.glb(?:\?|$)/.test(u)); assert(tileUrl);
    const source = await p.evaluate(async tileUrl => {
      const q = window.__offProbe;
      const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
      const original = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(tileUrl)).scene;
      const actual = q.scene.getObjectByName('tile-1_1.glb'); if (!actual) throw Error('Disabled source tile absent');
      function serialize(root) {
        root.updateMatrixWorld(true); const result = [];
        root.traverse(m => { if (!m.isMesh) return; const a = m.geometry.attributes.position, idx = m.geometry.index, count = idx?.count ?? a.count;
          for (let i = 0; i < count; i += 3) result.push([0, 1, 2].map(k => new q.THREE.Vector3().fromBufferAttribute(a, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld).toArray()));
        }); return result;
      }
      return { actual: serialize(actual), original: serialize(original) };
    }, tileUrl);
    assert.equal(source.original.length, 2032); assert.deepEqual(source.actual, source.original, 'Every original tile triangle, winding and world coordinate must remain');
    const isTarget = (await import('../src/geometry.js')).insideFootprint;
    const polygon = [[197.257,295.714],[218.816,309.494],[214.773,315.818],[214.635,316.035],[210.817,322.008],[210.503,322.499],[210.191,322.299],[197.801,314.38],[189.285,308.936],[185.837,306.732],[186.271,306.053],[188.592,302.421],[190.317,299.722],[193.296,301.627],[193.43,301.702]];
    const retainedTarget = source.actual.filter(t => t.every(([x, y, z]) => isTarget(x, z, polygon) && y >= 4.048 && y <= 59.708)).length;
    assert.equal(retainedTarget, 70);
    // Frame the source tower and verify real pointer input cannot activate it.
    await p.evaluate(() => window.__map.restoreCamera({ version: 1, projection: 'perspective', position: [270, 210, 385], target: [200, 30, 295], fov: 43, near: .5, far: 6000, zoom: 1 }));
    const hit = await p.evaluate(() => {
      const q = window.__offProbe, ray = new q.THREE.Raycaster(); q.camera.updateMatrixWorld(true);
      for (const [x, y, z] of [[205, 56.3, 315], [213, 40, 315], [204, 40, 319]]) {
        const v = new q.THREE.Vector3(x, y, z).project(q.camera); ray.setFromCamera(new q.THREE.Vector2(v.x, v.y), q.camera);
        const h = ray.intersectObjects(q.pickMeshes, false)[0]; let n = h?.object; while (n && !n.userData.buildingId) n = n.parent;
        if (h && !n && h.point.x > 185 && h.point.x < 220 && h.point.z > 295 && h.point.z < 324) return { x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2, world: h.point.toArray() };
      } return null;
    }); assert(hit, 'No visible original context tower ray hit');
    await p.mouse.move(hit.x, hit.y); await p.mouse.click(hit.x, hit.y); await p.waitForTimeout(350);
    const after = await p.evaluate(() => window.__map.snapshot()); assert.equal(after.selected, null); assert.equal(after.hovered, null);
    await p.mouse.move(5, 5); await p.screenshot({ path: `${out}/go-greek-disabled-context.png` });
    assert(!requests.some(u => /\/src\/broadway-683\.js(?:\?|$)/.test(u)), 'Disabled custom model was requested');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []);
    return { manifestSwitches: switches, roots: s.landmarks.map(l => l.id), originalTileTriangles: source.original.length, retainedTileTriangles: source.actual.length, retainedTargetTriangles: retainedTarget, customModelRequests: 0, disabled, hit, errors, failures };
  } finally { await off.close(); }
}
async function cleanArchitecture(label) {
  await page.mouse.move(5, 5);
  await page.evaluate(() => {
    const snapshot = window.__map.snapshot(), c = snapshot.camera;
    const offset = c.position.map((v, i) => v - c.target[i]), r = Math.hypot(...offset);
    const phi = Math.min(Math.acos(offset[1] / r), snapshot.navigation.cameraLimits.maxPolarAngle), theta = Math.atan2(offset[0], offset[2]);
    window.__map.select(null);
    window.__map.restoreCamera({ ...c, position: [c.target[0] + r * Math.sin(phi) * Math.sin(theta), c.target[1] + r * Math.cos(phi), c.target[2] + r * Math.sin(phi) * Math.cos(theta)] });
  });
  await settle(); await page.screenshot({ path: `${out}/${label}-architecture.png` });
}
try {
  const start = Date.now(); await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__map?.snapshot().status === 'ready' && document.querySelector('#app').dataset.state === 'entered', null, { timeout: 120000 });
  report.loadMs = Date.now() - start;
  assert(captured, captureError ?? 'Scene not captured'); await cdp.send('Debugger.disable');
  if (await page.getByRole('button', { name: 'Close assistant', exact: true }).isVisible()) await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.mouse.move(5, 5); await settle(); report.initial = await snap();
  await check('Complete startup, ten unique landmarks and exactly seventy replacement triangles', async () => {
    assert.deepEqual(report.initial.failed, []); assert.equal(report.initial.landmarks.length, 10); assert.equal(new Set(report.initial.landmarks.map(l => l.id)).size, 10);
    assert.equal(report.initial.removedBroadway683Triangles, 70); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []); assert.deepEqual(report.badResponses, []);
    assert.equal(await page.locator('option[value="683-broadway"]').textContent(), 'Go Greek');
    assert(report.requests.some(u => /\/src\/broadway-683\.js(?:\?|$)/.test(u)), 'Enabled model did not dynamically load');
    const data = await page.evaluate(async () => { const {buildingViews} = await import('/src/building-views.js'); return buildingViews['683-broadway']; }); assert(data);
    return { loadMs: report.loadMs, loaded: report.initial.loaded, view: data, probe: await probe() };
  });
  await page.screenshot({ path: `${out}/desktop-overview.png` });
  await check('Actual canvas hover and click select the complete building and focus the camera', async () => {
    const points = await hitPoints(); assert(points.length, 'No visible source-model ray intersection');
    const point = points[0]; await page.mouse.move(point.x, point.y); await page.waitForTimeout(700);
    const hovered = await snap(); assert.equal(hovered.hovered, '683-broadway'); assert.equal(hovered.selected, null);
    assert.deepEqual(hovered.landmarks.find(l => l.id === '683-broadway').bounds, report.initial.landmarks.find(l => l.id === '683-broadway').bounds);
    await page.mouse.click(point.x, point.y); await page.mouse.move(5, 5); await settle();
    const selected = await snap(); assert.equal(selected.selected, '683-broadway');
    assert.equal(await page.locator('.map-presence__building-card h2').textContent(), 'Go Greek');
    const distance = s => Math.hypot(...s.camera.position.map((v, i) => v - s.camera.target[i])); assert(distance(selected) < distance(report.initial));
    return { point, camera: selected.camera };
  });
  await check('All merged facade, roof, tank and garden geometry shares one white selected effect and fits desktop', async () => {
    const p = await probe(); assert.equal(p.sameIdRoots, 1); assert(p.meshes.length >= 1 && p.meshes.length <= 12); assert(p.meshes.every(m => m.pickable));
    assert.equal(p.overlays.length, p.meshes.length);
    for (const m of p.meshes) { const o = p.overlays.find(o => o.geometry === m.geometry); assert(o, m.name + ' missing effect'); assert.deepEqual(o.matrix, m.matrix); assert.equal(o.color, 'ffffff'); assert(Math.abs(o.opacity - .18) < .001); }
    assert.equal(p.effects.activeId, '683-broadway'); assert.equal(p.effects.selectionStrength, 1); assert.equal(p.effects.ringMeshes, 2); assert.equal(p.effects.outline.proxyCount, p.meshes.length);
    for (const v of [p.projectedMin, p.projectedMax]) assert(v.every(n => Math.abs(n) < 1), 'Desktop building clipped');
    report.desktop = p; return p;
  });
  await page.screenshot({ path: `${out}/desktop-selected.png` });
  await cleanArchitecture('desktop');
  await check('Reset restores original overview camera', async () => {
    await page.evaluate(() => { window.__map.reset(); window.__map.select('683-broadway'); window.__map.focus(); }); await settle();
    await page.evaluate(() => window.__map.reset()); await settle(); const s = await snap(); assert.equal(s.selected, null); sameCamera(s.camera, report.initial.camera); return s.camera;
  });
  await check('Actual canvas hover and inward wheel select and focus 683 Broadway', async () => {
    const points = await hitPoints(); assert(points.length); await page.mouse.move(points[0].x, points[0].y); await page.waitForTimeout(150); await page.mouse.wheel(0, -100); await settle(); const s = await snap(); assert.equal(s.selected, '683-broadway'); assert.equal((await probe()).effects.selectedId, '683-broadway'); return { hit: points[0], camera: s.camera };
  });
  await check('Outward real mouse wheel returns to saved overview', async () => {
    await page.evaluate(() => { window.__map.select('683-broadway'); window.__map.focus(); }); await settle();
    await page.mouse.move(700, 450); await page.mouse.wheel(0, 700); await settle(); const s = await snap(); assert.equal(s.selected, null); sameCamera(s.camera, report.initial.camera); return s.camera;
  });
  await check('Neighboring north complex and west podium cannot select 683 Broadway', async () => {
    await page.evaluate(() => { window.__map.restoreCamera({ version: 1, projection: 'perspective', position: [270, 210, 385], target: [200, 30, 295], fov: 43, near: .5, far: 6000, zoom: 1 }); }); await settle();
    const points = await page.evaluate(() => {
      const p = window.__broadwayProbe, ray = new p.THREE.Raycaster(), points = [];
      for (const [x, y, z] of [[204, 69, 281], [212, 67, 286], [184, 9, 301], [179, 9, 309]]) {
        const v = new p.THREE.Vector3(x, y, z).project(p.camera); ray.setFromCamera(new p.THREE.Vector2(v.x, v.y), p.camera); const hit = ray.intersectObjects(p.pickMeshes, false)[0]; if (!hit) continue;
        let n = hit.object; while (n && !n.userData.buildingId) n = n.parent;
        if (!n && Math.abs(v.x) < .9 && Math.abs(v.y) < .9) points.push({ x: (v.x + 1) * innerWidth / 2, y: (1 - v.y) * innerHeight / 2, hit: hit.point.toArray() });
      } return points;
    }); assert(points.length >= 2, 'Could not establish visible neighbor surfaces');
    for (const p of points) { await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); assert.notEqual((await snap()).selected, '683-broadway'); }
    return points;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => Math.abs(window.__broadwayProbe.camera.aspect - 390 / 844) < .0001);
  await page.evaluate(() => { window.__map.reset(); window.__map.select('683-broadway'); window.__map.focus(); }); await settle();
  await check('Mobile portrait complete model fits with stable selection and unchanged geometry', async () => {
    const s = await snap(), p = await probe(); assert.equal(s.selected, '683-broadway');
    assert.equal(s.landmarks.find(l => l.id === '683-broadway').triangles, report.initial.landmarks.find(l => l.id === '683-broadway').triangles);
    for (const v of [p.projectedMin, p.projectedMax]) assert(v.every(n => Math.abs(n) < 1), 'Mobile building clipped'); return { camera: s.camera, probe: p };
  });
  await page.screenshot({ path: `${out}/mobile-selected.png` });
  await cleanArchitecture('mobile');
  await check('Disabled popup removes all UI and interactions and preserves exact original source geometry', verifyDisabled);
  await check('No browser failures after all interactions', async () => { assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []); assert.deepEqual(report.badResponses, []); return { performance: await page.evaluate(() => window.__map.performance()) }; });
} catch (e) { report.failure = e.stack; throw e; }
finally { await fs.writeFile(`${out}/browser-results.json`, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
assert(report.checks.every(c => c.pass), 'Browser acceptance failures; inspect browser-results.json');
