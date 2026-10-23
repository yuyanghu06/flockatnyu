import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedMessages, safeSourceUrl, getAssistantStatus, streamAssistant, steerAssistant } from '../src/chat-client.js';
import { createAssistant } from '../src/assistant.js';
const encode = text => new TextEncoder().encode(text);
function response(parts, type = 'application/x-ndjson') { return new Response(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(typeof p === 'string' ? encode(p) : p)); c.close(); } }), { headers: { 'Content-Type': type } }); }
const status = { chat: { configured: true, provider: 'fixture', model: 'offline' }, knowledge: { configured: false, status: 'not_configured' }, access: { mode: 'fixture', allowed: true } };
const liveRun={type:'run',runId:'00000000-0000-4000-8000-000000000001',steeringToken:'a'.repeat(43)};
test('active reply input keeps the capability out of conversation and resets obsolete answer text',async()=>{
  const events=[],records=[liveRun,{type:'tool',id:'tool-1',name:'read_map_events',status:'running'},
    {type:'tool',id:'tool-1',name:'read_map_events',status:'completed'},{type:'delta',text:'Obsolete'},
    {type:'steering',messageId:'queue-2',sequence:1,status:'accepted'},{type:'reset',answerVersion:1},
    {type:'steering',messageId:'queue-2',sequence:1,status:'applied'},{type:'delta',text:'Updated answer'},{type:'done'}];
  assert.equal(await streamAssistant({messages:[{role:'user',content:'Original'}],onEvent:e=>events.push(e),fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.steering,true);assert.equal(JSON.stringify(body).includes(liveRun.steeringToken),false);
    return response(records.map(event=>JSON.stringify(event)+'\n'));
  }}),'Updated answer');
  assert.deepEqual(events,records);
  let request;
  const result=await steerAssistant({...liveRun,messageId:'queue-2',text:'Actually 7 PM',fetchImpl:async(url,options)=>{
    request={url,options};return Response.json({status:'accepted',messageId:'queue-2',sequence:1,applied:false},{status:202});
  }});
  assert.equal(result.applied,false,'HTTP acceptance does not claim that the active reply consumed the text');
  assert.equal(request.url,`/api/chat/${liveRun.runId}/steer`);
  assert.equal(request.options.headers['x-flock-steering-token'],liveRun.steeringToken);
  assert.deepEqual(JSON.parse(request.options.body),{messageId:'queue-2',text:'Actually 7 PM'});
});
test('active reply transport rejects invalid acknowledgements and reports late/failed input without leaking bodies',async()=>{
  const options={...liveRun,messageId:'queue-2',text:'Correction'};
  for(const code of [403,409,413,500])await assert.rejects(steerAssistant({...options,fetchImpl:async()=>new Response('private upstream detail',{status:code})}),error=>!error.message.includes('private')&&(code===500||error.message.includes('still queued')));
  for(const result of [{status:'accepted',messageId:'other',sequence:1},{status:'accepted',messageId:'queue-2',sequence:0}])
    await assert.rejects(steerAssistant({...options,fetchImpl:async()=>Response.json(result,{status:202})}),/still queued/);
  const accepted={type:'steering',messageId:'queue-2',sequence:1,status:'accepted'};
  for(const records of [[{...accepted,status:'applied'}],[accepted,accepted],[accepted,{...accepted,status:'applied',sequence:2}],[{type:'reset',answerVersion:2}]])
    await assert.rejects(streamAssistant({messages:[],fetchImpl:async()=>response([liveRun,...records,{type:'done'}].map(event=>JSON.stringify(event)+'\n'))}),/invalid .*update/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(steerAssistant({...options,signal:controller.signal,fetchImpl:async()=>{throw new DOMException('private','AbortError');}}),{name:'AbortError'});
});
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
  get classList(){return {
    add:(...tokens)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...tokens])].join(' ');},
    remove:(...tokens)=>{this.className=this.className.split(/\s+/).filter(token=>token&&!tokens.includes(token)).join(' ');},
    contains:token=>this.className.split(/\s+/).includes(token),
  };}
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
test('minimizing preserves an active reply, hidden completion and history; busy send still stops the current request', async () => {
  const saved={document:globalThis.document,fetch:globalThis.fetch,matchMedia:globalThis.matchMedia};
  const doc=new Element('document');doc.body=new Element('body');doc.createElement=tag=>new Element(tag);
  globalThis.document=doc;globalThis.matchMedia=()=>({matches:true});
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/status')return Response.json({...status,chat:{...status.chat,configured:true}});
    return new Response(new ReadableStream({start(controller){
      requests.push({controller,signal:options.signal,messages:JSON.parse(options.body).messages});
      options.signal.addEventListener('abort',()=>controller.error(new DOMException('Stopped','AbortError')));
    }}),{headers:{'Content-Type':'application/x-ndjson'}});
  };
  let assistant;
  try {
    assistant=createAssistant();await doc.emit('campus-enter');await tick();assistant.open();
    const root=doc.body.children[0],nodes=()=>all(root),input=nodes().find(n=>n.tagName==='textarea'),form=nodes().find(n=>n.className==='assistant-form'),panel=nodes().find(n=>n.tagName==='dialog');
    input.value='continue while hidden';const pending=form.emit('submit');await tick();
    const first=requests[0],send=event=>first.controller.enqueue(encode(JSON.stringify(event)+'\n'));
    send({type:'tool',id:'tool-1',name:'search_discord',status:'running'});await tick();
    await nodes().find(n=>n.attributes['aria-label']==='Close assistant').emit('click');
    assert(panel.hidden);assert.equal(first.signal.aborted,false);assert.equal(nodes().find(n=>n.className==='assistant-transcript').attributes['aria-busy'],'true');
    assistant.open();assert.equal(nodes().find(n=>n.attributes['aria-label']==='Stop generating').hidden,false);
    await panel.emit('cancel');assert(panel.hidden);assert.equal(first.signal.aborted,false);
    send({type:'tool',id:'tool-1',name:'search_discord',status:'completed'});
    send({type:'delta',text:'Finished while minimized.'});send({type:'done'});first.controller.close();await pending;
    assert.equal(first.signal.aborted,false);assert.equal(nodes().find(n=>n.className==='assistant-transcript').attributes['aria-busy'],'false');
    assert(nodes().some(n=>n.innerHTML?.includes('Finished while minimized.')));
    assert(!nodes().some(n=>n.textContent==='Stopped. This reply is incomplete.'));
    assistant.open();input.value='follow up';const next=form.emit('submit');await tick();
    assert.deepEqual(requests[1].messages.slice(-3),[{role:'user',content:'continue while hidden'},{role:'assistant',content:'Finished while minimized.'},{role:'user',content:'follow up'}]);
    await nodes().find(n=>n.attributes['aria-label']==='Stop generating').emit('click');await next;
    assert.equal(requests[1].signal.aborted,true);
  } finally {assistant?.dispose();Object.assign(globalThis,saved);}
});
test('offline fake DOM: gated entry, honest status, safe inline citations, keyboard, single busy send/stop control and paused loading failure', async () => {
  const oldDoc=globalThis.document,oldFetch=globalThis.fetch,oldMatchMedia=globalThis.matchMedia,doc=new Element('document');doc.body=new Element('body');doc.createElement=tag=>new Element(tag);globalThis.document=doc;globalThis.matchMedia=()=>({matches:true});
  let configured=false,calls=[],hangController;globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url==='/api/status')return Response.json({...status,chat:{...status.chat,configured}});if(JSON.parse(options.body).messages.at(-1).content==='hang')return new Response(new ReadableStream({start(c){hangController=c;options.signal.addEventListener('abort',()=>c.error(new DOMException('Stopped','AbortError')));}}),{headers:{'Content-Type':'application/x-ndjson'}});return response(['{"type":"meta","sources":[{"url":"javascript:alert(1)","title":"bad"},{"url":"https://example.com/info","title":"<img>"}],"knowledgeStatus":"not_configured"}\n','{"type":"delta","text":"<script>fixture</script> [Relevant record](https://example.com/cited)"}\n','{"type":"done"}\n']);};
  let assistant;
  try {
    assistant=createAssistant();const root=doc.body.children[0],find=c=>all(root).find(n=>n.className===c),panel=find('assistant-panel'),input=all(root).find(n=>n.tagName==='textarea'),form=find('assistant-form');assert(root.hidden);assistant.open();assert(panel.hidden);assert.equal(calls.length,0);
    await doc.emit('campus-enter');await tick();assert(!root.hidden&&panel.hidden&&!panel.open);assert(!input.disabled);assert(find('assistant-service').textContent.includes('setup pending'));assistant.open();assert(panel.open&&!panel.hidden);input.value='offline draft';await input.emit('input');assert(all(root).find(n=>n.attributes['aria-label']==='Send message').disabled);configured=true;await find('assistant-retry').emit('click');await tick();assert.equal(input.disabled,false);
    await doc.emit('campus-building-selected',{detail:{id:'bobst-library',name:'Bobst'}});assert.equal(find('assistant-context'),undefined);assert.equal(find('assistant-footer'),undefined);input.value='hello';await form.emit('submit');assert.equal(find('assistant-announcement').textContent,'Reply complete.');assert(all(root).some(n=>n.innerHTML?.includes('&lt;script&gt;fixture&lt;/script&gt;')));const links=all(root).filter(n=>n.tagName==='a');assert.equal(links.length,0,'metadata candidates are not automatically appended');assert(!all(root).some(n=>n.className==='assistant-sources'));assert(all(root).some(n=>n.innerHTML?.includes('href="https://example.com/cited"')),'relevant inline citations remain rendered');assert(!all(root).some(n=>n.innerHTML?.includes('https://example.com/info')),'unrelated retrieved URLs stay out of the reply');assert.equal(JSON.parse(calls.at(-1).options.body).buildingId,'bobst-library');
    const wheel=await root.emit('wheel');assert(wheel.stopped);await root.emit('keydown',{key:'Escape'});assert(panel.hidden);assistant.open();assert.equal(doc.activeElement,input);const shifted=await input.emit('keydown',{key:'Enter',shiftKey:true});assert(!shifted.prevented);
    assert(!all(root).some(n=>n.tagName==='button'&&n.textContent==='Clear chat'));assert.equal(find('assistant-identity').children.at(-1).textContent,'Flock@NYU');input.value='hello again';await form.emit('submit');assert.equal(JSON.parse(calls.at(-1).options.body).messages.length,3);
    input.value='hang';const stopped=form.emit('submit');await tick();
    const stop=all(root).find(n=>n.attributes['aria-label']==='Stop generating');
    const send=all(root).find(n=>n.classList.contains('assistant-send'));
    assert.equal(stop,send,'The existing composer send button stops the active run');
    assert.equal(all(root).filter(n=>n.attributes['aria-label']==='Stop generating').length,1);
    assert.equal(stop.hidden,false);assert.equal(stop.disabled,false);assert.equal(stop.type,'button');
    assert(!all(root).some(n=>n.classList.contains('assistant-stop')),'There is no separate header Stop control');
    await stop.emit('click');await stopped;
    assert.equal(stop.hidden,false);assert.equal(stop.type,'submit');assert.equal(stop.classList.contains('is-stopping'),false);
    assert.notEqual(stop.attributes['aria-label'],'Stop generating');
    assert.equal(find('assistant-announcement').textContent,'Reply stopped.');
    assert(all(root).some(n=>n.textContent==='Stopped. This reply is incomplete.'));
    assert.equal(find('assistant-queue-list').children.length,1);
    assert.match(find('assistant-queue-state').textContent,/Queue paused/);
    input.value='newer draft';
    const resume=all(root).find(n=>n.attributes['aria-label']==='Resume queued messages');
    const pending=resume.emit('click');await tick();assert(hangController);
    await doc.emit('campus-loading-failed');await pending;
    assert(root.hidden&&panel.hidden);assert(calls.at(-1).options.signal.aborted);assert(input.disabled);
    assert.equal(input.value,'newer draft');assert.equal(find('assistant-queue-list').children.length,1);
    assert(all(root).some(n=>n.textContent==='Interrupted while the map was loading. Resume this message from the queue.'));
    const callCount=calls.filter(call=>call.url==='/api/chat').length;
    await doc.emit('campus-enter');await tick();assistant.open();
    assert.equal(calls.filter(call=>call.url==='/api/chat').length,callCount,'loading recovery waits for explicit Resume');
    assert.match(find('assistant-queue-state').textContent,/Queue paused/);
  } finally {assistant?.dispose();globalThis.document=oldDoc;globalThis.fetch=oldFetch;globalThis.matchMedia=oldMatchMedia;}
});
