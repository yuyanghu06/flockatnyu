import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { serve } from '@hono/node-server';
import { chromium } from 'playwright-core';
import { contactsHttpFixture, contactsBrowserRows } from '../tests/fixtures/contacts-ui.mjs';

const output = process.env.CI_BROWSER_EVIDENCE || 'evidence/ci-browser';
await mkdir(output, { recursive: true });
const checks = [];
const errors = [];
const countLayouts = [];
let api, vite, browser, page;
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function ready(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Local server starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Local browser fixture did not start');
}
async function check(name, operation) {
  await operation();
  checks.push(name);
  console.log(`PASS ${name}`);
}
try {
  const fixture = contactsHttpFixture({ rows: contactsBrowserRows(), production: false });
  const apiPort = await freePort();
  const webPort = await freePort();
  const origin = `http://127.0.0.1:${webPort}`;
  api = serve({ fetch: fixture.app.fetch, hostname: '127.0.0.1', port: apiPort });
  vite = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ],
    {
      env: { ...process.env, PORT: String(apiPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  vite.stdout.resume();
  vite.stderr.on('data', (data) => process.stderr.write(data));
  await ready(`${origin}/api/contacts`);
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/status', (route) =>
    route.fulfill({ json: { chat: { configured: true }, access: { allowed: true } } }),
  );
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({ type: 'delta', text: 'Synthetic browser reply.' }) +
        '\n' +
        JSON.stringify({ type: 'done' }) +
        '\n',
    }),
  );
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await check('Map loads every asset and finishes startup', async () => {
    await page.waitForFunction(
      () => document.querySelector('#app')?.dataset.state === 'entered',
      null,
      { timeout: 120_000 },
    );
    assert.equal((await page.evaluate(() => window.__map.snapshot())).failed.length, 0);
    assert(await page.locator('#startup-notice').isHidden());
  });
  await check('Building selection and return to overview still work', async () => {
    await page.evaluate(() => {
      window.__map.select('bobst-library');
      window.__map.focus();
    });
    await page.waitForFunction(() => window.__map.snapshot().selected === 'bobst-library');
    await page.evaluate(() => window.__map.reset());
    await page.waitForFunction(() => window.__map.snapshot().selected === null);
  });
  const launcher = page.getByRole('button', { name: 'Open contacts', exact: true });
  async function countState(rows, total) {
    await page.waitForFunction(
      ({ rows, total }) =>
        document.querySelectorAll('.contacts-row').length === rows &&
        document.querySelector('.contacts-sidebar')?.getAttribute('aria-busy') === 'false' &&
        document.querySelector('.contacts-list-total')?.textContent === total,
      { rows, total: total === null ? '' : `${total} total` },
    );
  }
  async function countLayout(kind) {
    const layout = await page.locator('.contacts-list-meta').evaluate((meta) => {
      const [shown, total] = [...meta.children].map((node) => node.getBoundingClientRect());
      return {
        shown: shown.toJSON(),
        total: total.toJSON(),
        width: meta.clientWidth,
        scrollWidth: meta.scrollWidth,
      };
    });
    assert(layout.shown.right <= layout.total.left);
    assert(
      Math.abs(
        layout.shown.y + layout.shown.height / 2 - layout.total.y - layout.total.height / 2,
      ) < 1,
    );
    assert(layout.scrollWidth <= layout.width);
    countLayouts.push({ kind, ...layout });
  }
  await check(
    'Contacts totals stay beside loaded counts across paging, filtering and count failure',
    async () => {
      await launcher.click();
      await countState(10, 14);
      assert.equal(await page.locator('.contacts-list-shown').textContent(), '10 contacts shown');
      await countLayout('desktop');
      await page.screenshot({ path: `${output}/desktop-contact-count.png` });
      await page.getByRole('button', { name: 'Load more', exact: true }).click();
      await countState(14, 14);
      const search = page.getByRole('searchbox', { name: 'Search contacts' });
      await search.fill('rae@example.com');
      await countState(1, 14);
      await search.fill('No matching synthetic member');
      await countState(0, 14);
      fixture.mode.count = 'unavailable';
      await search.fill('');
      await countState(10, null);
      delete fixture.mode.count;
      await page.getByRole('button', { name: 'Refresh contacts', exact: true }).click();
      await countState(10, 14);
    },
  );
  await check('Contacts search and exact saved-field update use the real local API', async () => {
    await page.getByRole('searchbox', { name: 'Search contacts' }).fill('rae@example.com');
    await page.locator(`.contacts-row[data-contact-id="${fixture.f.state[0].id}"]`).click();
    await page.getByRole('heading', { name: 'Rae Example', exact: true }).waitFor();
    const notes = page.locator('.contacts-editor').getByLabel('Notes', { exact: true });
    await notes.fill('Saved by the isolated CI browser fixture.');
    await page.getByRole('button', { name: 'Save contact', exact: true }).click();
    await page.getByText('Changes saved.', { exact: true }).waitFor();
    assert.equal(fixture.f.state[0].raw_input.notes, 'Saved by the isolated CI browser fixture.');
    assert.equal(fixture.f.state[0].raw_input.legacy.preserve, 'exact original value');
    await countState(1, 14);
    await page.getByRole('button', { name: 'Add contact', exact: true }).click();
    await page
      .locator('.contacts-editor')
      .getByLabel('First name', { exact: true })
      .fill('New synthetic member');
    await page.getByRole('button', { name: 'Save contact', exact: true }).click();
    await page.getByText('Contact added.', { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('.contacts-list-total')?.textContent === '15 total',
    );
    await page.getByRole('button', { name: 'Delete contact', exact: true }).click();
    await page
      .getByRole('group', { name: 'Confirm contact deletion' })
      .getByRole('button', { name: 'Delete contact', exact: true })
      .click();
    await page.getByText('Contact deleted.', { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('.contacts-list-total')?.textContent === '14 total',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: 'Contacts', exact: true }).waitFor({ state: 'hidden' });
  });
  await check('Chat renders a streamed response from a simulated inference result', async () => {
    await page.getByRole('button', { name: 'Open campus assistant', exact: true }).click();
    await page.locator('#campus-assistant-message').fill('A synthetic browser question');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByText('Synthetic browser reply.', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
  });
  await check('Narrow screen keeps the Contacts dialog inside the viewport', async () => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await launcher.click();
    await page.getByRole('searchbox', { name: 'Search contacts' }).fill('');
    await countState(10, 14);
    await countLayout('mobile-320px');
    await page.screenshot({ path: `${output}/mobile-contact-count.png` });
    const rect = await page
      .locator('.contacts-panel')
      .evaluate((node) => node.getBoundingClientRect().toJSON());
    assert(rect.left >= -1 && rect.right <= 321 && rect.top >= -1 && rect.bottom <= 845);
  });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${output}/passed.png` });
} catch (error) {
  errors.push(error.stack);
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ checks, errors, countLayouts, simulatedServices: true }, null, 2) + '\n',
  );
  await browser?.close();
  if (vite && vite.exitCode === null) {
    vite.kill('SIGTERM');
    await Promise.race([once(vite, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (vite.exitCode === null) vite.kill('SIGKILL');
  }
  await new Promise((resolve) => (api ? api.close(resolve) : resolve()));
}
