// Isolated UI fixture: starts its own Vite server; never calls a real API/model.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite/chat-uploads-browser', server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__upload_check', route => route.fulfill({ contentType: 'text/html', body: `<html><body><script type="module">
    import { createAssistant } from '/src/features/assistant/assistant.js'; import '/src/features/assistant/assistant.css';
    window.uploadCalls = []; window.mode = 'ready'; window.mapRefreshes = 0;
    document.addEventListener('campus-map-updated', () => window.mapRefreshes++);
    window.fetch = async (url, options) => {
      if (url === '/api/status') return Response.json({ chat: { configured: true }, access: { allowed: true } });
      const body = JSON.parse(options.body); window.uploadCalls.push({ body, signal: options.signal });
      if (window.mode === 'fail') return Response.json({ type: 'error', message: 'Fixture upload rejected' }, { status: 400 });
      const events = [{type:'tool',id:'tool-1',name:'upsert_map_event',status:'running'}, {type:'tool',id:'tool-1',name:'upsert_map_event',status:'completed'}, {type:'delta',text:'Files read successfully.'}, {type:'done'}];
      if (window.mode === 'hold') return new Response(new ReadableStream({start(controller) {
        window.finishReply = () => { for (const event of events) controller.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\\n')); controller.close(); };
        options.signal.addEventListener('abort', () => controller.error(new DOMException('Stopped', 'AbortError')));
      }}), {headers:{'content-type':'application/x-ndjson'}});
      return new Response(events.map(event => JSON.stringify(event)+'\\n').join(''), {headers:{'content-type':'application/x-ndjson'}});
    };
    window.ui = createAssistant(); document.dispatchEvent(new Event('campus-enter'));
    </script></body></html>` }));
  const tinyImage = { name: 'campus.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') };
  const text = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Meeting notes 🌱') };
  const pdf = { name: 'agenda.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nfixture') };
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${baseUrl}/__upload_check`);
    await page.getByRole('button', { name: 'Open campus assistant' }).click();
    const picker = page.locator('input[type=file]'), input = page.locator('textarea'), send = page.locator('.assistant-send');
    assert(await send.isDisabled());
    const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Attach files', exact: true }).click(); await (await chooser).setFiles([tinyImage, text]);
    await page.getByRole('button', { name: 'Remove notes.txt' }).waitFor();
    assert.equal(await page.locator('.assistant-attachment-preview').count(), 1); assert(await send.isEnabled());
    await page.getByRole('button', { name: 'Remove notes.txt' }).click();
    await picker.setInputFiles([pdf]); await page.getByRole('button', { name: 'Remove agenda.pdf' }).waitFor();
    assert.equal(await input.inputValue(), '');
    await page.evaluate(() => { window.mode = 'hold'; }); await send.click();
    await page.getByRole('button', { name: 'Stop generating' }).waitFor();
    await page.getByRole('button', { name: 'Close assistant' }).click();
    await page.waitForFunction(() => document.querySelector('dialog').hidden);
    assert.equal(await page.evaluate(() => window.uploadCalls[0].signal.aborted), false);
    await page.evaluate(() => window.finishReply());
    await page.waitForFunction(() => document.querySelector('.assistant-announcement').textContent === 'Reply complete.');
    await page.getByRole('button', { name: 'Open campus assistant' }).click();
    assert.match(await page.locator('.assistant-assistant').last().textContent(), /Files read successfully/);
    assert.equal(await page.evaluate(() => window.mapRefreshes), 1);
    const current = await page.evaluate(() => window.uploadCalls[0].body.messages.at(-1));
    assert.deepEqual(current.attachments.map(file => file.name), ['campus.png', 'agenda.pdf']);
    assert.equal(typeof current.content, 'string');
    await page.evaluate(() => { window.mode = 'ready'; });
    await input.fill('Follow up'); await send.click();
    await page.waitForFunction(() => window.uploadCalls.length === 2 && document.querySelector('.assistant-announcement').textContent === 'Reply complete.');
    assert.equal(await page.evaluate(() => window.uploadCalls[1].body.messages[0].attachments.length), 2);
    await picker.setInputFiles([text]); await page.getByRole('button', { name: 'Remove notes.txt' }).waitFor();
    await picker.setInputFiles([{name:'bad.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<svg/>')}]);
    await page.getByRole('alert').waitFor(); assert.match(await page.getByRole('alert').textContent(), /Supported files/);
    assert.equal(await page.getByRole('button', { name: 'Remove notes.txt' }).count(), 1);
    await page.evaluate(() => { window.mode = 'fail'; }); await input.fill('Keep my draft'); await send.click();
    await page.waitForFunction(() => document.querySelector('.assistant-announcement').textContent === 'The reply could not finish.');
    assert.equal(await input.inputValue(), 'Keep my draft'); assert.equal(await page.getByRole('button', { name: 'Remove notes.txt' }).count(), 1);
    await page.getByRole('button', { name: 'Remove notes.txt' }).click();
    await input.fill('');
    await input.evaluate(element => {
      const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0))], 'pasted.png', {type:'image/png'}));
      element.dispatchEvent(new ClipboardEvent('paste', {bubbles:true,cancelable:true,clipboardData:transfer}));
    });
    await page.getByRole('button', { name: 'Remove pasted.png' }).waitFor();
    await page.locator('dialog').evaluate(element => {
      const transfer = new DataTransfer(); transfer.items.add(new File(['Dropped notes'], 'dropped.txt', {type:'text/plain'}));
      element.dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer}));
    });
    await page.getByRole('button', { name: 'Remove dropped.txt' }).waitFor();
    await page.evaluate(() => { window.mode = 'hold'; }); await send.click();
    await page.getByRole('button', { name: 'Stop generating' }).click();
    await page.waitForFunction(() => document.querySelector('.assistant-announcement').textContent === 'Reply stopped.');
    assert.equal(await page.getByRole('button', { name: 'Remove pasted.png' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Remove dropped.txt' }).count(), 1);
    const geometry = await page.locator('dialog').evaluate(element => ({ width: element.getBoundingClientRect().width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    assert(geometry.width <= width); assert(geometry.scrollWidth <= geometry.clientWidth);
    console.log(JSON.stringify({width, picker:true, preview:true, removable:true, attachmentOnly:true, nativeMetadata:true, history:true, hiddenCompletion:true, refreshEvent:true, failedDraftPreserved:true, unsupportedType:true, paste:true, drop:true, stop:true, boundedLayout:true}));
  }
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await server.close(); }
