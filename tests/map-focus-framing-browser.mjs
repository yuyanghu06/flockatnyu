// Real-canvas acceptance using an isolated Vite server and synthetic APIs.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const out = process.env.MAP_EVIDENCE ?? 'evidence/camera-framing';
await mkdir(out, { recursive: true });
const server = process.env.MAP_URL ? null : await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
  envDir: false, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error',
});
await server?.listen();
const url = process.env.MAP_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'MAP_URL must be local');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: process.env.MAP_SOFTWARE_WEBGL === 'true' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
const report = { url, checks: [], errors: [], blockedRequests: [] };
async function check(name, fn) {
  const detail = await fn(); report.checks.push({ name, detail, pass: true }); console.log('PASS ' + name);
}
const snapshot = page => page.evaluate(() => window.__map.snapshot());
const settle = page => page.waitForTimeout(220);
const offset = camera => camera.position.map((n, i) => n - camera.target[i]);
async function reset(page) {
  await page.mouse.move(2, 2); await page.evaluate(() => window.__map.reset()); await settle(page);
}
async function drag(page, start, end, button = 'left') {
  await page.mouse.move(...start); await page.mouse.down({ button });
  await page.mouse.move(...end, { steps: 12 }); await page.mouse.up({ button }); await settle(page);
}
async function pointerSelect(page, id) {
  // Change selection without leaving the focused pose. A subsequent click must
  // actually select this building; clearing selection would restore overview zoom.
  await page.evaluate(id => window.__map.select(id === 'bobst-library' ? 'courant-institute' : 'bobst-library'), id);
  await page.mouse.move(2, 2); await settle(page);
  const center = await page.evaluate(id => window.__map.project(id), id);
  const { width, height } = page.viewportSize();
  const geometric = await page.evaluate(async id => {
    const T = await import('/node_modules/three/build/three.module.js');
    const state = window.__map.snapshot(), pose = state.camera;
    const landmark = state.landmarks.find(x => x.id === id);
    const camera = new T.PerspectiveCamera(pose.fov, innerWidth / innerHeight, pose.near, pose.far);
    camera.position.fromArray(pose.position); camera.zoom = pose.zoom;
    camera.lookAt(new T.Vector3().fromArray(pose.target)); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const points = [];
    for (const bounds of [...(landmark.parts ?? []).map(part => part.bounds), landmark.bounds]) {
      for (const fx of [.2, .5, .8]) for (const fz of [.2, .5, .8]) for (const fy of [.5, .95]) {
        const p = new T.Vector3(bounds.min[0] + (bounds.max[0] - bounds.min[0]) * fx,
          bounds.min[1] + (bounds.max[1] - bounds.min[1]) * fy,
          bounds.min[2] + (bounds.max[2] - bounds.min[2]) * fz).project(camera);
        points.push({ x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 });
      }
    }
    return points;
  }, id);
  const candidates = [...[[0, 0], [0, -24], [-24, 0], [24, 0], [0, 24]].map(([x, y]) => ({ x: center.x + x, y: center.y + y })),
    ...geometric];
  for (const { x, y } of candidates) {
    if (x < 12 || x >= width - 12 || y < 30 || y >= height - 50) continue;
    await page.mouse.move(x, y); await page.waitForTimeout(110);
    if ((await snapshot(page)).hovered !== id) continue;
    await page.mouse.click(x, y); assert.equal((await snapshot(page)).selected, id, 'actual canvas click');
    return { x, y };
  }
  throw new Error('No actual canvas hit for ' + id);
}
async function frame(page, id) {
  await page.mouse.move(2, 2);
  await page.evaluate(id => { window.__map.select(id); window.__map.focus(); }, id); await settle(page);
  return page.evaluate(async id => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { mapFocusLayout } = await import('/src/map-focus-layout.js');
    const snapshot = window.__map.snapshot(), pose = snapshot.camera;
    const bounds = snapshot.landmarks.find(x => x.id === id).bounds;
    const camera = new T.PerspectiveCamera(pose.fov, innerWidth / innerHeight, pose.near, pose.far);
    camera.position.fromArray(pose.position); camera.zoom = pose.zoom;
    camera.lookAt(new T.Vector3().fromArray(pose.target)); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const points = [];
    for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
      const p = new T.Vector3(x, y, z).project(camera);
      points.push({ x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 });
    }
    const box = { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
      top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
    const card = document.querySelector('.map-presence__building-card').getBoundingClientRect();
    const frame = mapFocusLayout(innerWidth, innerHeight).frame;
    return { id, box, frame, visible: box.left >= frame.left - 2 && box.right <= frame.right + 2
      && box.top >= frame.top - 2 && box.bottom <= frame.bottom + 2,
      overlap: box.left < card.right && box.right > card.left && box.top < card.bottom && box.bottom > card.top };
  }, id);
}
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 783, height: 514 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
    try {
      const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
      await context.route('**/*', route => {
        const requested = new URL(route.request().url());
        if (requested.origin !== new URL(url).origin) {
          report.blockedRequests.push(requested.origin); return route.abort('blockedbyclient');
        }
        if (requested.pathname.startsWith('/api/')) return route.fulfill({ json: requested.pathname === '/api/map/presence'
          ? { status: 'ok', buildings: [], upcoming: [], observedAt: new Date().toISOString() }
          : { chat: { configured: false }, access: { allowed: false }, knowledge: { configured: false } } });
        return route.continue();
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__map?.snapshot().status === 'ready'
        && document.querySelector('#app').dataset.state === 'entered', null, { timeout: 60000 });
      const close = page.getByRole('button', { name: 'Close assistant', exact: true });
      if (await close.isVisible()) await close.click();
      const initial = await snapshot(page), ids = initial.landmarks.map(x => x.id);
      if (viewport.width === 1440) await check('Arch, Bobst and Paulson retain authoritative world placement', async () => {
        const arch = initial.landmarks.find(x => x.id === 'washington-square-arch').bounds;
        const bobst = initial.landmarks.find(x => x.id === 'bobst-library').bounds;
        const paulson = initial.landmarks.find(x => x.id === 'nyu-john-a-paulson-center').bounds;
        assert(Math.abs(arch.max[1] - arch.min[1] - 20.5) < 1e-6); assert(Math.abs(arch.min[1] - .68) < 1e-6);
        assert(Math.abs((arch.min[0] + arch.max[0]) / 2 - 19.191) < 1e-5);
        assert(Math.abs(bobst.min[1] - 2.688) < 1e-5); assert(Math.abs(paulson.min[1] - 2.4857) < 1e-5);
        assert(Math.abs(paulson.max[1] - paulson.min[1] - 91) < 1e-4); return { arch, bobst, paulson };
      });
      await check(`Every complete building fits beside its card: ${viewport.width}`, async () => {
        const results = [];
        for (const id of ids) {
          const result = await frame(page, id);
          assert(result.visible && !result.overlap, JSON.stringify(result)); results.push(result);
        }
        return results;
      });
      if (viewport.width !== 783) {
        await check(`Actual canvas hover and click select every enabled landmark: ${viewport.width}`, async () => {
          const hits = [];
          for (const id of ids) { await reset(page); await frame(page, id); hits.push({ id, point: await pointerSelect(page, id) }); }
          return hits;
        });
        await check(`Actual orbit, pan, wheel and bounded camera travel: ${viewport.width}`, async () => {
          await reset(page); const center = [viewport.width * .65, viewport.height * .45];
          const before = (await snapshot(page)).camera;
          await drag(page, center, [center[0] + 60, center[1] + 35]); const orbit = (await snapshot(page)).camera;
          assert.notDeepEqual(orbit.position, before.position);
          // Finish orbit damping before measuring a separate pan gesture.
          await page.evaluate(camera => window.__map.restoreCamera(camera), orbit);
          await drag(page, center, [center[0] + 45, center[1] + 20], 'right'); const pan = (await snapshot(page)).camera;
          assert.notDeepEqual(pan.target, orbit.target);
          offset(pan).forEach((n, i) => assert(Math.abs(n - offset(orbit)[i]) < .01));
          await page.evaluate(camera => window.__map.restoreCamera(camera), pan);
          await frame(page, 'bobst-library'); const focused = (await snapshot(page)).camera;
          await page.mouse.move(...center); await page.mouse.wheel(0, 700); await settle(page);
          const zoomed = (await snapshot(page)).camera;
          // Outward wheel from a selected building restores the saved overview.
          // Mobile framing can already use a wider lens than that overview.
          zoomed.position.concat(zoomed.target).forEach((n, i) =>
            assert(Math.abs(n - pan.position.concat(pan.target)[i]) < .002, 'outward wheel restores overview'));
          assert(Math.abs(zoomed.zoom - pan.zoom) < 1e-6);
          assert.notDeepEqual(zoomed, focused);
          const bounds = initial.navigation.cameraLimits.targetBounds;
          await page.evaluate(({ camera, bounds }) => {
            const target = [bounds.maxX, camera.target[1], bounds.maxZ];
            window.__map.restoreCamera({ ...camera, target, position: target.map((n, i) => n + camera.position[i] - camera.target[i]) });
          }, { camera: before, bounds });
          const edge = (await snapshot(page)).camera;
          await drag(page, center, [center[0] - viewport.width * .5, center[1] + viewport.height * .4], 'right');
          const bounded = (await snapshot(page)).camera;
          assert(bounded.target[0] <= bounds.maxX + 1e-6 && bounded.target[0] >= bounds.minX - 1e-6);
          assert(bounded.target[2] <= bounds.maxZ + 1e-6 && bounded.target[2] >= bounds.minZ - 1e-6);
          offset(bounded).forEach((n, i) => assert(Math.abs(n - offset(edge)[i]) < .01));
          await reset(page); const resetCamera = (await snapshot(page)).camera;
          resetCamera.position.concat(resetCamera.target).forEach((n, i) => assert(Math.abs(n - initial.camera.position.concat(initial.camera.target)[i]) < 1e-6));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
          return { before, orbit, pan, focused, zoomed, bounded };
        });
      }
      if (viewport.width === 1440) await check('Paulson, Courant and Stern remain selectable from opposite sides', async () => {
        const hits = [];
        for (const id of ['nyu-john-a-paulson-center', 'courant-institute', 'stern-school-of-business']) {
          await reset(page); await frame(page, id); const camera = (await snapshot(page)).camera;
          await page.evaluate(({ camera, overview }) => {
            // Focus poses may intentionally use a tilt outside the manual camera
            // limits. Use the valid overview tilt for the opposite-side view.
            const direction = overview.position.map((n, i) => n - overview.target[i]);
            const scale = Math.hypot(...camera.position.map((n, i) => n - camera.target[i])) / Math.hypot(...direction);
            const position = camera.target.map((n, i) => n + direction[i] * scale * (i === 1 ? 1 : -1));
            window.__map.restoreCamera({ ...camera, position });
          }, { camera, overview: initial.camera });
          hits.push({ id, point: await pointerSelect(page, id) });
        }
        return hits;
      });
      await page.screenshot({ path: `${out}/acceptance-${viewport.width}.png` }); assert.deepEqual(initial.failed, []);
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.blockedRequests, []);
} catch (error) { report.failure = error.stack; process.exitCode = 1;
} finally {
  await browser.close(); await server?.close();
  await writeFile(`${out}/browser-results.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ checks: report.checks.length, failure: report.failure, errors: report.errors }));
}
