import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createWebsite} from '../server/web.js';

async function fixture() {
  const response = await createWebsite().fetch(new Request('https://club.example/login'));
  const html = await response.text();
  const events = new Map(), windowEvents = new Map();
  const clock = {}, masked = {textContent:'', scrollWidth:200};
  let submissions = 0;
  const input = {value:'', form:{requestSubmit:() => submissions++}, addEventListener:(name, fn) => events.set(name, fn)};
  const elements = {'.clock':clock, '.masked':masked, input};
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document:{querySelector:name => elements[name]},
    window:{addEventListener:(name, fn) => windowEvents.set(name, fn)},
    Intl, Date, setInterval:() => 0,
  });
  return {input, masked, clock, events, windowEvents, submissions:() => submissions};
}

test('password presentation masks typing, paste, clearing and restored values without plaintext echo', async () => {
  const f = await fixture();
  assert.equal(f.masked.textContent, '');
  for (const [value, event] of [['synthetic-fixture','input'], ['x'.repeat(1024),'change'], ['','input']]) {
    f.input.value = value; f.events.get(event)();
    assert.equal(f.masked.textContent, '*'.repeat(value.length));
    assert.equal(f.masked.scrollLeft, 200);
  }
  f.input.value = 'restored-fixture'; f.windowEvents.get('pageshow')();
  assert.equal(f.masked.textContent, '*'.repeat(f.input.value.length));
  assert.match(f.clock.textContent, /^[A-Za-z]{3} [A-Za-z]{3} \d{2} \d{2}:\d{2}:\d{2} \d{4}$/);
});

test('Enter requests one native validated form submission, while ordinary keys and IME composition do not', async () => {
  const f = await fixture();
  let prevented = 0;
  const keydown = f.events.get('keydown');
  keydown({key:'x', preventDefault:() => prevented++});
  keydown({key:'Enter', isComposing:true, preventDefault:() => prevented++});
  assert.equal(f.submissions(), 0); assert.equal(prevented, 0);
  keydown({key:'Enter', isComposing:false, preventDefault:() => prevented++});
  assert.equal(f.submissions(), 1); assert.equal(prevented, 1);
});
