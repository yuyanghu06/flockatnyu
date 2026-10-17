import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedMessages, safeSourceUrl, getAssistantStatus, streamAssistant } from '../src/chat-client.js';
import { createAssistant } from '../src/assistant.js';
const encode = text => new TextEncoder().encode(text);
function response(parts, type = 'application/x-ndjson') { return new Response(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(typeof p === 'string' ? encode(p) : p)); c.close(); } }), { headers: { 'Content-Type': type } }); }
const status = { chat: { configured: true, provider: 'fixture', model: 'offline' }, knowledge: { configured: false, status: 'not_configured' }, access: { mode: 'fixture', allowed: true } };
test('offline fixture: UTF8 split across chunks, metadata, final done without newline', async () => {
  const bytes = encode('{"type":"meta","sources":[]}\n{"type":"delta","text":"Hi 🌱"}\n{"type":"done"}'), events = [];
  const result = await streamAssistant({ messages: [{ role: 'user', content: 'hello' }], buildingId: 'bobst-library', fetchImpl: async (url, options) => { assert.equal(url, '/api/chat'); assert.equal(JSON.parse(options.body).buildingId, 'bobst-library'); return response(Array.from(bytes, b => new Uint8Array([b]))); }, onEvent: e => events.push(e.type) });
  assert.equal(result, 'Hi 🌱'); assert.deepEqual(events, ['meta','delta','done']);
});
test('offline fixture: EOF without done and malformed/unknown/error events fail truthfully', async () => {
  for (const [text, pattern] of [['{"type":"delta","text":"partial"}\n', /before the reply finished/], ['bad\n', /invalid data/], ['null\n', /invalid data/], ['{"type":"mystery"}\n', /unknown event/], ['{"type":"error","message":"Provider unavailable"}\n', /Provider unavailable/], ['{"type":"delta","text":5}\n', /invalid text/]]) await assert.rejects(streamAssistant({ messages: [], fetchImpl: async () => response([text]) }), pattern);
});
test('offline fixture: wrong content type, HTTP errors and invalid status responses', async () => {
  await assert.rejects(streamAssistant({ messages: [], fetchImpl: async () => response(['<html/>'], 'text/html') }), /did not return/);
  await assert.rejects(streamAssistant({ messages: [], fetchImpl: async () => new Response('{"error":{"message":"Access denied"}}', { status: 403 }) }), /Access denied/);
  await assert.rejects(getAssistantStatus({ fetchImpl: async () => new Response('<html/>') }), /API is unavailable/);
  await assert.rejects(getAssistantStatus({ fetchImpl: async () => Response.json({}) }), /invalid status/);
  assert.deepEqual(await getAssistantStatus({ fetchImpl: async () => Response.json(status) }), status);
});
test('offline fixture: abort is propagated and reader is released', async () => {
  const abort = new AbortController(); abort.abort(); await assert.rejects(streamAssistant({ messages: [], signal: abort.signal, fetchImpl: async () => response(['{"type":"done"}\n']) }), { name: 'AbortError' });
});
test('history excludes system roles and is bounded; citations allow only explicit HTTP(S)', () => {
  const messages = boundedMessages([{ role: 'system', content: 'bad' }, ...Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:'x'.repeat(9000)}))]); assert(messages.length<=20); assert(messages.every(m=>m.content.length<=8000)); assert(messages.reduce((n,m)=>n+m.content.length,0)<=16000); assert(Buffer.byteLength(JSON.stringify({messages}))<=32500); assert.equal(messages.at(-1).role,'assistant');
  for (const url of ['javascript:alert(1)','data:text/html,test','file:///secret','/relative',null]) assert.equal(safeSourceUrl(url),null); assert.equal(safeSourceUrl('https://example.com/a'),'https://example.com/a');
});
test('connection checks bound hung fetch/body, preserve external abort and sanitize gateway failures', async () => {
  const hang = () => new Promise(() => {});
  await assert.rejects(getAssistantStatus({ timeoutMs: 10, fetchImpl: hang }), /timed out/);
  await assert.rejects(getAssistantStatus({ timeoutMs: 10, fetchImpl: async () => ({ ok: true, json: hang }) }), /timed out/);
  const controller = new AbortController();
  const pending = getAssistantStatus({ signal: controller.signal, fetchImpl: hang }); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  for (const code of [500, 502, 504]) {
    await assert.rejects(getAssistantStatus({ fetchImpl: async () => new Response('private upstream detail', { status: code }) }), e => e.message.includes('npm run dev') && !e.message.includes('private'));
    await assert.rejects(streamAssistant({ messages: [], fetchImpl: async () => new Response('private upstream detail', { status: code }) }), e => e.message.includes('npm run dev') && !e.message.includes('private'));
  }
  for (const code of [401, 403, 429]) await assert.rejects(getAssistantStatus({ fetchImpl: async () => new Response('private', { status: code }) }), code === 429 ? /busy/ : /Access denied/);
  await assert.rejects(streamAssistant({ messages: [], fetchImpl: async () => { throw new Error('private URL or key'); } }), e => e.message.includes('npm run dev') && !e.message.includes('private'));
});
class Element {
  constructor(tag) { this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.className='';this.style={};this.open=false; }
  append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get isConnected(){return this.tagName==='body'||Boolean(this.parent?.isConnected);}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return {left:100,right:740,top:100,bottom:350};}
  get firstElementChild(){return this.children[0];}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
  removeEventListener(k,f){this.listeners[k]=(this.listeners[k]??[]).filter(x=>x!==f);}
  async emit(type,props={}){const e={type,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...props};for(const f of this.listeners[type]??[])await f(e);return e;}
  focus(){globalThis.document.activeElement=this;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  requestSubmit(){return this.emit('submit');}
}
function all(root){return [root,...root.children.flatMap(all)];}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('offline fake DOM: gated entry, honest status, streaming safe text/sources, keyboard, clear and failure abort', async () => {
  const oldDoc=globalThis.document,oldFetch=globalThis.fetch,doc=new Element('document');doc.body=new Element('body');doc.createElement=tag=>new Element(tag);globalThis.document=doc;
  let configured=false,calls=[],hangController;globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url==='/api/status')return Response.json({...status,chat:{...status.chat,configured}});if(JSON.parse(options.body).messages.at(-1).content==='hang')return new Response(new ReadableStream({start(c){hangController=c;options.signal.addEventListener('abort',()=>c.error(new DOMException('Stopped','AbortError')));}}),{headers:{'Content-Type':'application/x-ndjson'}});return response(['{"type":"meta","sources":[{"url":"javascript:alert(1)","title":"bad"},{"url":"https://example.com/info","title":"<img>"}],"knowledgeStatus":"not_configured"}\n','{"type":"delta","text":"<script>fixture</script>"}\n','{"type":"done"}\n']);};
  let assistant;
  try {
    assistant=createAssistant();const root=doc.body.children[0],find=c=>all(root).find(n=>n.className===c),panel=find('assistant-panel'),input=all(root).find(n=>n.tagName==='textarea'),form=find('assistant-form');assert(root.hidden);assistant.open();assert(panel.hidden);assert.equal(calls.length,0);
    await doc.emit('campus-enter');await tick();assert(!root.hidden&&panel.hidden&&!panel.open);assert(!input.disabled);assert(find('assistant-service').textContent.includes('setup pending'));assistant.open();assert(panel.open&&!panel.hidden);input.value='offline draft';await input.emit('input');assert(all(root).find(n=>n.attributes['aria-label']==='Send message').disabled);configured=true;await find('assistant-retry').emit('click');await tick();assert.equal(input.disabled,false);
    await doc.emit('campus-building-selected',{detail:{id:'bobst-library',name:'Bobst'}});assert.equal(find('assistant-context').textContent,'Selected: Bobst');input.value='hello';await form.emit('submit');assert.equal(find('assistant-announcement').textContent,'Reply complete.');assert(all(root).some(n=>n.textContent==='<script>fixture</script>'));const links=all(root).filter(n=>n.tagName==='a');assert.equal(links.length,1);assert.equal(links[0].textContent,'<img>');assert.equal(JSON.parse(calls.at(-1).options.body).buildingId,'bobst-library');
    const wheel=await root.emit('wheel');assert(wheel.stopped);await root.emit('keydown',{key:'Escape'});assert(panel.hidden);assistant.open();assert.equal(doc.activeElement,input);const shifted=await input.emit('keydown',{key:'Enter',shiftKey:true});assert(!shifted.prevented);
    const clear=all(root).find(n=>n.tagName==='button'&&n.textContent==='Clear chat');await clear.emit('click');assert.equal(find('assistant-transcript').children.length,0);input.value='hello again';await form.emit('submit');assert.equal(JSON.parse(calls.at(-1).options.body).messages.length,1);
    input.value='hang';const stopped=form.emit('submit');await tick();const stop=all(root).find(n=>n.tagName==='button'&&n.textContent==='Stop');await stop.emit('click');await stopped;assert.equal(find('assistant-announcement').textContent,'Reply stopped.');assert(all(root).some(n=>n.textContent==='Stopped. This reply is incomplete.'));input.value='hang';const pending=form.emit('submit');await tick();assert(hangController);await doc.emit('campus-loading-failed');await pending;assert(root.hidden&&panel.hidden);assert(calls.at(-1).options.signal.aborted);assert(input.disabled);
  } finally {assistant?.dispose();globalThis.document=oldDoc;globalThis.fetch=oldFetch;}
});
