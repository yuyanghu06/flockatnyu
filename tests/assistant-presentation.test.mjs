import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantShortcut, sourceLabel } from '../src/assistant-presentation.js';

test('Miro source labels hide opaque native and encoded board IDs and URL paths', () => {
  const id = 'uXjVSyntheticBoard=';
  const href = `https://miro.com/app/board/${id}/?moveToWidget=synthetic`;
  for (const title of [id, encodeURIComponent(id), encodeURIComponent(encodeURIComponent(id)), `Miro board: ${id}`, href, `/app/board/${id}/`, `app/board/${id}/`]) {
    const source = { title, url: href };
    assert.equal(sourceLabel(source, href), 'Miro board', title);
    assert.equal(source.url, href);
  }
  assert.equal(sourceLabel({title:encodeURIComponent(id)}, `https://miro.com/board/${encodeURIComponent(id)}/`), 'Miro board');
});

test('source labels prefer real supplied names and preserve other sources', () => {
  const href = 'https://miro.com/app/board/uXjVSyntheticBoard=/';
  assert.equal(sourceLabel({title:'Fall planning board', name:'Other name'}, href), 'Fall planning board');
  assert.equal(sourceLabel({title:'uXjVSyntheticBoard=', name:'Fall planning board'}, href), 'Fall planning board');
  assert.equal(sourceLabel({title:'Miro board', name:'Fall planning board'}, href), 'Fall planning board');
  assert.equal(sourceLabel({title:'   ', name:'Useful title'}, 'https://example.com/event'), 'Useful title');
  assert.equal(sourceLabel({}, 'https://example.com/event'), 'example.com');
  assert.equal(sourceLabel({title:'uXjVSyntheticBoard='}, 'https://example.com/app/board/uXjVSyntheticBoard=/'), 'uXjVSyntheticBoard=');
});

test('shortcut follows modern platform API, legacy platform and safe user agent fallback', () => {
  for (const navigator of [{userAgentData:{platform:'macOS'}, platform:'Win32'}, {platform:'MacIntel'}, {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}]) {
    assert.deepEqual(assistantShortcut(navigator), {label:'⌘ K', key:'Meta+K', modifier:'metaKey', mobile:false});
  }
  for (const navigator of [{userAgentData:{platform:'Windows'}}, {platform:'Win32'}, {platform:'Linux x86_64'}, {}]) {
    assert.deepEqual(assistantShortcut(navigator), {label:'Ctrl K', key:'Control+K', modifier:'ctrlKey', mobile:false});
  }
  const inaccessible = {get userAgentData(){throw Error('Unavailable');}, get platform(){throw Error('Unavailable');}, userAgent:'Macintosh'};
  assert.equal(assistantShortcut(inaccessible).key, 'Meta+K');
});

test('mobile platforms including desktop-mode iPad suppress desktop shortcuts', () => {
  for (const navigator of [{userAgentData:{mobile:true,platform:'Android'}}, {platform:'iPhone'}, {userAgent:'Mozilla/5.0 (Linux; Android 16) Mobile'}, {platform:'MacIntel',maxTouchPoints:5}]) assert.equal(assistantShortcut(navigator).mobile, true);
});
