import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const baseUrl = process.env.MAP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">
import { createAssistant } from '/src/assistant.js';
import '/src/assistant.css';
const encoder = new TextEncoder();
const h = window.harness = { calls: [], streams: [], steers: [], inFlight: 0, maxInFlight: 0, offline: false, httpNext: false, steerMode: 'accept', emitRun: true };
window.fetch = async (url, options) => {
  if (url === '/api/status') return h.offline ? new Response('', { status: 502 }) : Response.json({ chat: { configured: true }, access: { allowed: true } });
  if (/^\\/api\\/chat\\/[^/]+\\/steer$/.test(url)) {
    const body=JSON.parse(options.body),streamIndex=h.streams.length-1;
    const entry={body,url,headers:options.headers,signal:options.signal,streamIndex,sequence:h.steers.filter(s=>s.streamIndex===streamIndex).length+1};h.steers.push(entry);
    const accepted=()=>Response.json({status:'accepted',messageId:body.messageId,sequence:entry.sequence,applied:false},{status:202});
    if(h.steerMode==='hold')return new Promise(resolve=>entry.respond=(status=202)=>resolve(status===202?accepted():new Response('',{status})));
    if(h.steerMode==='closed')return new Response('',{status:409});
    if(h.steerMode==='error')throw Error('Synthetic network interruption');
    return accepted();
  }
  if(url!=='/api/chat')throw Error('Unexpected fixture network request');
  const call = { body: JSON.parse(options.body), signal: options.signal };
  h.calls.push(call);
  if (h.httpNext) { h.httpNext = false; return new Response('', { status: 500 }); }
  h.inFlight++; h.maxInFlight = Math.max(h.maxInFlight, h.inFlight);
  let settled = false, controller;
  const settle = () => { if (!settled) { settled = true; h.inFlight--; } };
  const abort = () => { settle(); controller.error(new DOMException('Stopped', 'AbortError')); };
  const stream = new ReadableStream({ start(c) { controller = c; }, cancel() { settle(); options.signal.removeEventListener('abort', abort); } });
  options.signal.addEventListener('abort', abort, { once: true });
  const entry={
    event(event) { controller.enqueue(encoder.encode(JSON.stringify(event) + '\\n')); },
    delta(text) { controller.enqueue(encoder.encode(JSON.stringify({ type: 'delta', text }) + '\\n')); },
    complete(text = 'Completed answer') { this.delta(text); controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\\n')); settle(); controller.close(); },
    incomplete() { settle(); controller.close(); },
  };h.streams.push(entry);
  if(h.emitRun)entry.event({type:'run',runId:'00000000-0000-4000-8000-'+String(h.streams.length).padStart(12,'0'),steeringToken:'a'.repeat(43)});
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
};
window.ui = createAssistant({ getBuilding: () => ({ id: 'bobst', name: 'Bobst Library' }) });
document.dispatchEvent(new Event('campus-enter'));
</script></body></html>`;
const page = await browser.newPage({ viewport: { width: 1280, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/__queue_check', route => route.fulfill({ contentType: 'text/html', body: fixture }));
const input = page.getByRole('textbox', { name: 'Message', exact: true });
const pending = page.locator('.assistant-queue-item');
const calls = async () => page.evaluate(() => window.harness.calls.map(call => call.body));
const waitCalls = count => page.waitForFunction(count => window.harness.calls.length === count, count);
const complete = (index, text) => page.evaluate(({ index, text }) => window.harness.streams[index].complete(text), { index, text });
const steerCount = count => page.waitForFunction(count=>window.harness.steers.length===count,count);
const inject = text => page.getByRole('button',{name:new RegExp('^Add queued message \\d+ to current reply: '+text+'$')}).click();
const steering = (index,status) => page.evaluate(({index,status})=>{
  const h=window.harness,s=h.steers[index];h.streams[s.streamIndex].event({type:'steering',messageId:s.body.messageId,sequence:s.sequence,status});
},{index,status});
async function attachText(name, text) {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await page.waitForFunction(name => !document.querySelector('.assistant-attach').disabled && [...document.querySelectorAll('.assistant-attachments .assistant-attachment-name')].some(node => node.textContent === name), name);
}
async function reset() {
  await page.goto(baseUrl + '/__queue_check');
  await page.getByRole('button', { name: 'Open campus assistant' }).click();
  await page.waitForFunction(() => document.querySelector('.assistant-service').dataset.connected === 'true');
}
async function send(text) { await input.fill(text); await input.press('Enter'); }
async function paused(count) {
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop generating', exact: true }).waitFor({state:'hidden'});
  assert.equal(await pending.count(), count);
}
async function geometry(size) {
  await page.setViewportSize(size);
  await page.waitForTimeout(350);
  const result = await page.evaluate(() => {
    const panel = document.querySelector('.assistant-panel').getBoundingClientRect();
    const send = document.querySelector('.assistant-send').getBoundingClientRect();
    const header = document.querySelector('.assistant-header').getBoundingClientRect();
    const form = document.querySelector('.assistant-form').getBoundingClientRect();
    const list = document.querySelector('.assistant-queue-list');
    return { panel: { top: panel.top, bottom: panel.bottom, left: panel.left, right: panel.right }, send: { top: send.top, bottom: send.bottom }, headerBottom: header.bottom, formTop: form.top, queueHeight: list.clientHeight, queueScrollHeight: list.scrollHeight, width: innerWidth, height: innerHeight };
  });
  assert(result.panel.top >= 0 && result.panel.bottom <= size.height, JSON.stringify(result));
  assert(result.panel.left >= 0 && result.panel.right <= size.width, JSON.stringify(result));
  assert(result.send.top >= result.formTop && result.send.bottom <= result.panel.bottom, JSON.stringify(result));
  assert(result.formTop >= result.headerBottom - 1, JSON.stringify(result));
  return result;
}

try {
  await reset();
  await send('First question'); await waitCalls(1);
  await page.evaluate(() => window.harness.streams[0].delta('First partial'));
  await attachText('second.txt', 'Second attachment'); await send('Second question');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('campus-building-selected', { detail: { id: 'stern', name: 'Stern' } })));
  await send('Remove this question'); await send('Fourth question');
  await input.fill('Unsent draft');
  assert.equal((await calls()).length, 1);
  assert.equal(await pending.count(), 3);
  await page.getByRole('button', { name: 'Remove queued message 2: Remove this question', exact: true }).click();
  assert.deepEqual(await pending.locator('.assistant-queue-text').allTextContents(), ['Second question', 'Fourth question']);
  assert.equal(await page.locator('.assistant-user').count(), 1, 'queued messages have not entered the sent transcript');
  assert(await page.getByRole('button', { name: 'Stop generating', exact: true }).isVisible());
  assert.equal(await page.locator('.assistant-header').getByRole('button', { name: 'Stop generating', exact: true }).count(), 0, 'the composer has the only Stop control');
  assert.equal(await page.locator('.assistant-send').getAttribute('type'), 'button');
  assert(await page.locator('.assistant-send').isEnabled(), 'busy Stop remains usable while a draft is present');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(60);
  const controls = await page.evaluate(() => {
    const send = document.querySelector('.assistant-send');
    const arrow = document.querySelector('.assistant-queue-inject'), remove = document.querySelector('.assistant-queue-remove');
    return { clearColor: getComputedStyle(document.querySelector('.assistant-queue-clear')).color,
      arrowColor: getComputedStyle(arrow).color, arrowRight: arrow.getBoundingClientRect().right, removeLeft: remove.getBoundingClientRect().left,
      animation: getComputedStyle(send, '::before').animationName, transform: getComputedStyle(send, '::before').transform };
  });
  assert.equal(controls.clearColor, 'rgb(0, 0, 0)', 'Clear is black');
  const arrowRgb = controls.arrowColor.match(/\d+/g).slice(0, 3).map(Number);
  assert(Math.max(...arrowRgb) - Math.min(...arrowRgb) <= 10 && arrowRgb[0] >= 120 && arrowRgb[0] <= 210, `queue arrow should be faint gray: ${controls.arrowColor}`);
  assert(controls.arrowRight <= controls.removeLeft + 1, 'the inject arrow sits beside and before its remove X');
  assert.notEqual(controls.animation, 'none', 'busy send background animates');
  await page.waitForTimeout(100);
  assert.notEqual(await page.locator('.assistant-send').evaluate(button => getComputedStyle(button, '::before').transform), controls.transform, 'the busy background visibly moves');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.assistant-send'), '::before').animationName === 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const desktop = await geometry({ width: 1280, height: 844 });
  await page.screenshot({ path: '/tmp/flock-assistant-queue-desktop.png' });
  await complete(0, ' complete'); await waitCalls(2);
  const second = (await calls())[1];
  assert.deepEqual(second.messages.map(message => message.content), ['First question', 'First partial complete', 'Second question']);
  assert.equal(second.buildingId, 'bobst');
  assert.equal(second.messages.at(-1).attachments[0].name, 'second.txt');
  assert.equal(Buffer.from(second.messages.at(-1).attachments[0].data, 'base64').toString(), 'Second attachment');
  await complete(1, 'Second answer'); await waitCalls(3);
  const fourth = (await calls())[2];
  assert.equal(fourth.buildingId, 'stern');
  assert.deepEqual(fourth.messages.map(message => message.content), ['First question', 'First partial complete', 'Second question', 'Second answer', 'Fourth question']);
  await complete(2, 'Fourth answer');
  await page.waitForFunction(() => document.querySelector('.assistant-announcement').textContent === 'Reply complete.');
  assert.equal(await input.inputValue(), 'Unsent draft');
  assert.equal(await page.evaluate(() => window.harness.maxInFlight), 1);
  assert(await page.locator('.assistant-queue').isHidden());
  console.log(JSON.stringify({ scenario: 'FIFO latest completed history, removal, attachments and captured building', desktop }));

  await reset();
  await attachText('retry.txt', 'Keep this for retry'); await send('Stopped question'); await waitCalls(1);
  await page.evaluate(() => window.harness.streams[0].delta('Incomplete answer must stay out of history'));
  await attachText('later.txt', 'Later attachment'); await send('Later question');
  await input.fill('Newer draft'); await attachText('draft.txt', 'Unsent draft attachment');
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click(); await paused(2);
  assert.equal((await calls()).length, 1);
  assert.equal(await input.inputValue(), 'Newer draft');
  assert.equal(await page.locator('.assistant-attachments .assistant-attachment-name').textContent(), 'draft.txt');
  assert.deepEqual(await pending.locator('.assistant-queue-text').allTextContents(), ['Stopped question', 'Later question']);
  assert.match(await pending.first().textContent(), /retry.txt.*ready to retry/);
  assert(await page.evaluate(() => window.harness.calls[0].signal.aborted));
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).click(); await waitCalls(2);
  assert.deepEqual((await calls())[1].messages.map(message => message.content), ['Stopped question']);
  assert.equal((await calls())[1].messages[0].attachments[0].name, 'retry.txt');
  await complete(1, 'Retried successfully'); await waitCalls(3);
  assert.deepEqual((await calls())[2].messages.map(message => message.content), ['Stopped question', 'Retried successfully', 'Later question']);
  assert.equal((await calls())[2].messages.at(-1).attachments[0].name, 'later.txt');
  await complete(2, 'Later answer');
  await page.getByRole('button', { name: 'Stop generating', exact: true }).waitFor({state:'hidden'});
  assert.equal(await input.inputValue(), 'Newer draft');
  console.log('PASS Stop pauses with retryable original files, preserves newer draft/files, and Resume excludes incomplete turns');

  await reset();
  await attachText('failure.txt', 'Retry attachment'); await send('Interrupted connection'); await waitCalls(1);
  await send('Wait for recovery'); await input.fill('Keep editing');
  await page.evaluate(() => { window.harness.streams[0].delta('Interrupted partial'); window.harness.streams[0].incomplete(); });
  await paused(2);
  assert.equal((await calls()).length, 1);
  assert.equal(await input.inputValue(), 'Keep editing');
  await page.evaluate(() => window.harness.httpNext = true);
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).click(); await waitCalls(2); await paused(2);
  assert.equal(await input.inputValue(), 'Keep editing');
  assert.equal((await calls())[1].messages.length, 1);
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).click(); await waitCalls(3);
  await complete(1, ''); await paused(2);
  assert.equal((await calls()).length, 3, 'empty terminal reply also pauses');
  await page.getByRole('button', { name: 'Remove queued message 1: Interrupted connection', exact: true }).click();
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).click(); await waitCalls(4);
  assert.deepEqual((await calls())[3].messages.map(message => message.content), ['Wait for recovery']);
  await complete(2, 'Recovered answer');
  console.log('PASS incomplete stream, HTTP failure and empty reply pause without losing pending messages or draft');

  await reset();
  await send('Hidden first'); await waitCalls(1); await send('Hidden second');
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.locator('.assistant-panel').waitFor({ state: 'hidden' });
  await complete(0, 'Hidden first answer'); await waitCalls(2);
  await complete(1, 'Hidden second answer');
  await page.getByRole('button', { name: 'Open campus assistant' }).click();
  await page.getByText('Hidden second answer', { exact: true }).waitFor();
  assert.equal((await calls())[1].messages[1].content, 'Hidden first answer');
  await send('Dispose first'); await waitCalls(3); await send('Never dispatch after disposal');
  await page.evaluate(() => window.ui.dispose());
  await page.waitForTimeout(50);
  assert.equal((await calls()).length, 3);
  assert(await page.evaluate(() => window.harness.calls[2].signal.aborted));
  assert.equal(await page.locator('.campus-assistant').count(), 0);
  await reset(); await send('Loading failure first'); await waitCalls(1); await send('Never dispatch after loading failure');
  await page.evaluate(() => document.dispatchEvent(new Event('campus-loading-failed')));
  await page.evaluate(() => document.dispatchEvent(new Event('campus-enter')));
  await page.getByRole('button', { name: 'Open campus assistant' }).click();
  await page.waitForTimeout(50);
  assert.equal((await calls()).length, 1);
  assert(await page.evaluate(() => window.harness.calls[0].signal.aborted));
  assert.equal(await pending.count(), 2);
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).waitFor();
  console.log('PASS hidden queue progression and retained replies; disposal clears and loading failure pauses pending dispatch');

  await reset();
  await send('Active message'); await waitCalls(1);
  for (let index = 1; index <= 9; index++) await send(`Queued ${index}: A long follow-up message that should remain on one clear bounded row.`);
  await send('Limit retains this draft');
  assert.equal(await pending.count(), 9);
  assert.equal(await input.inputValue(), 'Limit retains this draft');
  assert.match(await page.getByRole('alert').textContent(), /Up to 10/);
  const mobile = await geometry({ width: 390, height: 480 });
  assert(mobile.queueScrollHeight > mobile.queueHeight, JSON.stringify(mobile));
  assert(await page.getByRole('button', { name: 'Stop generating', exact: true }).isVisible());
  await page.screenshot({ path: '/tmp/flock-assistant-queue-mobile.png' });
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click(); await paused(10);
  await input.fill('A retained draft that wraps to multiple lines. '.repeat(8));
  await attachText('mobile-draft.txt', 'Retained mobile attachment');
  const keyboard = await geometry({ width: 390, height: 320 });
  await page.getByRole('button', { name: 'Resume queued messages', exact: true }).scrollIntoViewIfNeeded();
  assert(await page.getByRole('button', { name: 'Resume queued messages', exact: true }).isVisible());
  await page.screenshot({ path: '/tmp/flock-assistant-queue-mobile-keyboard.png' });
  await page.getByRole('button', { name: 'Clear queued messages', exact: true }).click();
  assert.equal(await pending.count(), 0);
  assert.match(await input.inputValue(), /retained draft/);
  assert.equal((await calls()).length, 1);
  console.log(JSON.stringify({ scenario: 'Bounded queue and keyboard-height layout; explicit clear retains draft', mobile, keyboard }));

  await reset();
  const largePdf = Buffer.alloc(5 * 1024 * 1024, 32); largePdf.write('%PDF-1.7\n');
  const uploadPdf = async name => {
    await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer: largePdf });
    await page.waitForFunction(name => !document.querySelector('.assistant-attach').disabled && [...document.querySelectorAll('.assistant-attachments .assistant-attachment-name')].some(node => node.textContent === name), name);
  };
  await uploadPdf('active.pdf'); await send('Large active attachment'); await waitCalls(1);
  await uploadPdf('queued-one.pdf'); await send('Large queued attachment one');
  await uploadPdf('queued-two.pdf'); await send('Large queued attachment two');
  await uploadPdf('queued-three.pdf'); await send('Large queued attachment three');
  await input.fill('Do not lose this draft');
  await page.locator('input[type=file]').setInputFiles({ name: 'over-budget.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nOver budget') });
  await page.waitForFunction(() => !document.querySelector('.assistant-attach').disabled);
  assert.match(await page.getByRole('alert').textContent(), /20 MiB/);
  assert.equal(await input.inputValue(), 'Do not lose this draft');
  assert.equal(await page.locator('.assistant-attachments .assistant-attachment-name').count(), 0);
  assert.equal(await pending.count(), 3);
  await page.getByRole('button', { name: 'Remove queued message 1: Large queued attachment one', exact: true }).click();
  await attachText('fits-now.txt', 'Released queue memory can be reused');
  assert.equal((await calls()).length, 1);
  console.log('PASS 20 MiB aggregate active/queued/draft file cap with visible rejection, retained draft and memory reuse after removal');

  await reset();
  await input.fill('Line one'); await input.press('Shift+Enter');
  assert.equal(await input.inputValue(), 'Line one\n');
  await input.evaluate(input => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
  assert.equal((await calls()).length, 0);
  await input.press('Enter'); await waitCalls(1); await complete(0, 'Keyboard answer');
  await page.getByRole('button', { name: 'Stop generating', exact: true }).waitFor({state:'hidden'});
  await page.evaluate(() => window.harness.offline = true);
  await page.evaluate(() => document.dispatchEvent(new Event('campus-loading-failed')));
  await page.evaluate(() => document.dispatchEvent(new Event('campus-enter')));
  await page.getByRole('button', { name: 'Open campus assistant' }).click();
  await page.getByText('Assistant offline', { exact: true }).waitFor();
  await input.fill('Offline draft'); await attachText('offline.txt', 'Offline file');
  assert(await input.isEnabled());
  assert(await page.getByRole('button', { name: 'Send message', exact: true }).isDisabled());
  await page.evaluate(() => window.harness.offline = false);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Send message', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.assistant-send').disabled);
  assert.equal(await input.inputValue(), 'Offline draft');
  assert.equal((await calls()).length, 1);
  await input.press('Enter'); await waitCalls(2); await complete(1, 'Offline recovery answer');
  console.log('PASS Enter, Shift+Enter and IME protection; offline draft/files recover without automatic submission');
  await reset();
  await send('Original active question');await waitCalls(1);
  await send('Unchosen earlier question');await send('Use 7 PM instead');await input.fill('Keep this draft');
  await geometry({width:1280,height:844});await page.screenshot({path:'/tmp/flock-assistant-steering-desktop.png'});
  await geometry({width:390,height:480});await page.screenshot({path:'/tmp/flock-assistant-steering-mobile.png'});
  await inject('Use 7 PM instead');await steerCount(1);
  assert.equal((await calls()).length,1,'the arrow injects into the same run, never starts or promotes another turn');
  assert.deepEqual(await pending.locator('.assistant-queue-text').allTextContents(),['Unchosen earlier question','Use 7 PM instead']);
  assert(await page.getByRole('button',{name:'Clear queued messages',exact:true}).isDisabled());
  assert(await page.getByRole('button',{name:'Remove queued message 2: Use 7 PM instead',exact:true}).isDisabled());
  assert(await page.getByRole('button',{name:'Remove queued message 1: Unchosen earlier question',exact:true}).isEnabled());
  await steering(0,'accepted');await page.waitForTimeout(40);assert.equal(await pending.count(),2,'HTTP202 plus accepted event do not consume');
  await steering(0,'applied');await pending.filter({hasText:'Use 7 PM instead'}).waitFor({state:'detached'});
  assert.deepEqual(await page.locator('.assistant-user .assistant-message-text').allTextContents(),['Original active question','Use 7 PM instead']);
  await page.evaluate(()=>{const stream=window.harness.streams[0];stream.event({type:'tool',id:'tool-1',name:'read_map_events',status:'running'});stream.event({type:'tool',id:'tool-1',name:'read_map_events',status:'completed'});stream.delta('Old answer that must disappear');});
  await page.getByText('Old answer that must disappear',{exact:true}).waitFor();
  await page.evaluate(()=>window.harness.streams[0].event({type:'reset',answerVersion:1}));
  await page.getByText('Old answer that must disappear',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.locator('.assistant-tool').count(),1,'reset keeps completed tool rows');
  await complete(0,'Correct 7 PM answer');await waitCalls(2);
  assert.deepEqual((await calls())[1].messages.map(message=>message.content),['Original active question','Use 7 PM instead','Correct 7 PM answer','Unchosen earlier question']);
  assert.equal(await input.inputValue(),'Keep this draft');await complete(1,'Other answer');
  console.log('PASS same-run chosen-row injection, ack-only removal, stable other queue order, reset tool preservation and exact-once subsequent history');

  await reset();await send('Files active');await waitCalls(1);
  await attachText('separate.txt','Keep file snapshot');await send('File message');
  const fileArrow=page.getByRole('button',{name:'Add queued message 1 to current reply: File message',exact:true});
  assert(await fileArrow.isDisabled());assert.match(await fileArrow.getAttribute('title'),/files/);
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('campus-building-selected',{detail:{id:'stern',name:'Stern'}})));
  await send('Other building');const buildingArrow=page.getByRole('button',{name:'Add queued message 2 to current reply: Other building',exact:true});
  assert(await buildingArrow.isDisabled());assert.match(await buildingArrow.getAttribute('title'),/different building/);
  assert.equal(await page.evaluate(()=>window.harness.steers.length),0);
  await complete(0,'Original done');await waitCalls(2);assert.equal((await calls())[1].messages.at(-1).attachments[0].name,'separate.txt');
  assert.equal((await calls())[1].buildingId,'bobst');await complete(1,'File done');await waitCalls(3);assert.equal((await calls())[2].buildingId,'stern');await complete(2,'Building done');
  await reset();await page.evaluate(()=>window.harness.emitRun=false);await send('Old protocol');await send('Must remain queued');
  assert(await page.getByRole('button',{name:'Add queued message 1 to current reply: Must remain queued',exact:true}).isDisabled());
  console.log('PASS files, captured-building mismatch and missing capability disable arrows without changing queued snapshots');

  await reset();await page.evaluate(()=>window.harness.steerMode='hold');await send('Active before early ack');await send('Early applied input');
  await inject('Early applied input');await steerCount(1);await steering(0,'accepted');await steering(0,'applied');
  await pending.waitFor({state:'hidden'});
  await page.evaluate(()=>window.harness.steers[0].respond(500));await page.waitForTimeout(50);
  assert.equal(await pending.count(),0,'late HTTP failure cannot restore already-applied input');
  assert.equal(await page.locator('.assistant-user').count(),2);
  await send('Later question');await complete(0,'Ack beat HTTP');await waitCalls(2);
  assert.equal((await calls())[1].messages.filter(message=>message.content==='Early applied input').length,1);await complete(1,'Later done');
  console.log('PASS applied-before-HTTP race consumes exactly once and ignores a later failed POST response');

  for(const mode of ['hold','closed','error']){
    await reset();await page.evaluate(mode=>window.harness.steerMode=mode,mode);
    await send('Active race '+mode);await send('Keep on failure');await inject('Keep on failure');await steerCount(1);
    if(mode==='hold')await steering(0,'accepted');
    await complete(0,'Existing reply finished');await paused(1);
    assert.equal((await calls()).length,1,'a failed/raced injection never falls back to a new request');
    assert(await page.getByRole('button',{name:'Remove queued message 1: Keep on failure',exact:true}).isEnabled());
    if(mode==='hold')await page.evaluate(()=>window.harness.steers[0].respond(202));
    await page.waitForTimeout(40);assert.equal(await pending.count(),1);
    await page.getByRole('button',{name:'Resume queued messages',exact:true}).click();await waitCalls(2);
    assert.deepEqual((await calls())[1].messages.map(message=>message.content),['Active race '+mode,'Existing reply finished','Keep on failure']);await complete(1,'Manual resume done');
  }
  console.log('PASS done-before-applied, terminal409 and network failure retain the queued row, unlock it and pause until explicit Resume');

  await reset();await attachText('original.txt','Original active file');await send('Original with file');await waitCalls(1);await send('Applied before stop');
  await inject('Applied before stop');await steerCount(1);await steering(0,'accepted');await steering(0,'applied');await pending.waitFor({state:'hidden'});
  await page.evaluate(()=>window.harness.streams[0].delta('Incomplete text'));
  await page.getByRole('button',{name:'Close assistant',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.harness.calls[0].signal.aborted),false);
  await page.getByRole('button',{name:'Open campus assistant',exact:true}).click();
  await page.getByRole('button',{name:'Stop generating',exact:true}).click();await paused(1);
  assert.match(await pending.textContent(),/Added to reply: Applied before stop/);
  await page.getByRole('button',{name:'Resume queued messages',exact:true}).click();await waitCalls(2);
  const retry=(await calls())[1];assert.deepEqual(retry.messages.map(message=>message.content),['Original with file','Applied before stop']);
  assert.equal(retry.messages[0].attachments[0].name,'original.txt');assert.equal(retry.buildingId,'bobst');
  await complete(1,'Successful resumed answer');
  console.log('PASS applied input survives Stop/Resume once with the original file and building; minimized panel keeps active request');
  for(const cleanup of ['dispose','loading']){
    await reset();await page.evaluate(()=>window.harness.steerMode='hold');await send('Cleanup active');await send('Cleanup queued');await inject('Cleanup queued');await steerCount(1);
    await page.evaluate(cleanup=>{if(cleanup==='dispose')window.ui.dispose();else document.dispatchEvent(new Event('campus-loading-failed'));},cleanup);
    assert.equal(await page.evaluate(()=>window.harness.calls[0].signal.aborted),true);
    await page.evaluate(()=>window.harness.steers[0].respond(202));await page.waitForTimeout(40);assert.equal((await calls()).length,1);
    if(cleanup==='loading'){
      await page.evaluate(()=>document.dispatchEvent(new Event('campus-enter')));await page.getByRole('button',{name:'Open campus assistant',exact:true}).click();
      await paused(2);assert.deepEqual(await pending.locator('.assistant-queue-text').allTextContents(),['Cleanup active','Cleanup queued']);
    }
  }
  console.log('PASS pending injection cleanup aborts on dispose/loading failure and cannot start a hidden replacement request');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
