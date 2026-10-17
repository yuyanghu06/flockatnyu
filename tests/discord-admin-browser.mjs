// Real browser UI fixtures; no Discord, Supabase, or model network requests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const evidence = path.resolve('evidence/m16-discord-archive');
await fs.mkdir(evidence, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let denied = true, unavailable = false;
let channels = [{ sourceId: '22222222-2222-4222-8222-222222222222', channelId: '234567890123456789', guildId: '123456789012345678', title: '<img src=x onerror=alert(1)> Events', enabled: true }];
const mutations = [];
await page.route('**/api/admin/discord**', async route => {
  const request = route.request();
  if (denied) return route.fulfill({ status: 403, json: { status: 'forbidden' } });
  if (unavailable) return route.fulfill({ status: 503, json: { status: 'not_configured' } });
  if (request.method() === 'PUT') {
    const body = request.postDataJSON(); mutations.push(body);
    const i = channels.findIndex(c => c.channelId === body.channel.channelId);
    if (i >= 0) channels[i] = body.channel;
    else channels.push({ ...body.channel, sourceId: '33333333-3333-4333-8333-333333333333' });
    return route.fulfill({ json: { status: 'ready', channel: body.channel } });
  }
  return route.fulfill({ json: { status: 'ready', channels, sync: { configured: false, guildId: channels[0].guildId } } });
});
const checks = [];
try {
  await page.goto(`http://127.0.0.1:${port}/admin.html`);
  await page.getByRole('status').filter({ hasText: 'Administrator access is required.' }).waitFor();
  assert.equal(await page.locator('#admin-content').isVisible(), false);
  assert.equal(mutations.length, 0);
  await page.screenshot({ path: path.join(evidence, 'admin-denied.png'), fullPage: true });
  checks.push('denied access hides channel controls and explains admin requirement');

  denied = false;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.locator('#admin-content').waitFor({ state: 'visible' });
  await page.getByRole('status').filter({ hasText: 'Configure Discord discovery' }).waitFor();
  assert.equal(await page.locator('#channel-list img').count(), 0);
  assert.equal(await page.locator('#guild-id').inputValue(), channels[0].guildId);
  assert.equal(await page.locator('#guild-id').getAttribute('readonly'), '');
  assert.match(await page.locator('#channel-list').innerText(), /<img src=x/);
  assert.equal(await page.locator('#backfill-date').count(), 0);
  checks.push('authorized fixture shows inert user text, configured guild and honest discovery status without backfill controls');

  await page.getByRole('button', { name: /^Disable / }).click();
  await page.getByRole('button', { name: /^Enable / }).waitFor();
  assert.equal(mutations[0].channel.enabled, false);
  assert.equal(mutations[0].channel.sourceId, channels[0].sourceId);
  await page.locator('#channel-id').fill('345678901234567890');
  await page.locator('#channel-title').fill('Planning');
  await page.getByRole('button', { name: 'Add channel', exact: true }).click();
  await page.locator('#channel-list').filter({ hasText: 'Planning' }).waitFor();
  assert(!JSON.stringify(mutations).includes('backfillFrom'));
  assert.equal(mutations[1].channel.enabled, true);
  assert.equal(await page.locator('#channel-id').inputValue(), '');
  assert(!JSON.stringify(mutations).includes('allowedMemberIds'));
  await page.screenshot({ path: path.join(evidence, 'admin-desktop.png'), fullPage: true });
  checks.push('disable and add forms roundtrip with identity and omit backfill and permission grants');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(evidence, 'admin-mobile.png'), fullPage: true });
  checks.push('mobile controls fit viewport without horizontal overflow');

  unavailable = true;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('status').filter({ hasText: 'The channel catalogue is not ready.' }).waitFor();
  assert.equal(await page.locator('#admin-content').isVisible(), false);
  assert.equal(errors.length, 0);
  checks.push('database unavailable hides stale configuration and reports failure without browser errors');
  await fs.writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ status: 'passed', checks, browser: await browser.version(), errors, fixturesOnly: true }, null, 2));
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, evidence }, null, 2));
} finally { await browser.close(); await vite.close(); }
