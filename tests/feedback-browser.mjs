// Synthetic acceptance only. Isolated Vite server, no app API, source or model calls.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const evidence = 'evidence/site-feedback';
await mkdir(evidence, { recursive: true });
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
const receipt = { synthetic: true, command: 'node tests/feedback-browser.mjs', scenarios: [], errors: [], findings: [] };
function check(condition, message) { if (!condition) receipt.findings.push(message); }
const sources = [
  { title: 'uXjVSyntheticBoard=', url: 'https://miro.com/app/board/uXjVSyntheticBoard=/' },
  { title: 'uXjVSyntheticBoard%3D', url: 'https://miro.com/app/board/uXjVSyntheticBoard%3D/?moveToWidget=synthetic' },
  { title: 'Fall planning board', url: 'https://miro.com/app/board/uXjVNamedSynthetic=/' },
  { title: 'Unsafe JS', url: 'javascript:alert(1)' },
  { title: 'Unsafe data', url: 'data:text/html,bad' },
  { title: 'Unsafe file', url: 'file:///tmp/synthetic' },
  { title: 'Relative', url: '/synthetic' },
];
const fixture = `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#cbd7c5"><div id="map" style="height:100vh"></div><script type="module">
import {createAssistant} from '/src/features/assistant/assistant.js'; import '/src/features/assistant/assistant.css';
window.mode='stream'; window.calls=[]; window.mapEvents=[]; const encode=new TextEncoder();
window.fetch=async(url,options)=>{
 if(url==='/api/status')return Response.json({chat:{configured:true},access:{allowed:true}});
 if(url!=='/api/chat')throw new Error('Unexpected fixture URL');
 const call={signal:options.signal,body:JSON.parse(options.body)};window.calls.push(call);
 if(window.mode==='fail')return Response.json({message:'Synthetic rejected request'},{status:400});
 return new Response(new ReadableStream({start(c){
  let ended=false;const send=e=>{if(!ended)c.enqueue(encode.encode(JSON.stringify(e)+'\\n'));};
  const finish=()=>{if(ended)return;send({type:'tool',id:'tool-1',name:'list_calendar_events',status:'completed'});send({type:'meta',sources:${JSON.stringify(sources)}});send({type:'delta',text:'\\n\\nFinal synthetic detail.'});send({type:'done'});ended=true;c.close();};
  options.signal.addEventListener('abort',()=>{if(!ended){ended=true;c.error(new DOMException('Stopped','AbortError'));}});
  send({type:'tool',id:'tool-1',name:'list_calendar_events',status:'running'});
  if(window.mode==='hold'){window.finishReply=finish;window.sendPartial=send;return;}
  let n=0;const timer=setInterval(()=>{if(ended){clearInterval(timer);return;}send({type:'delta',text:'\\n\\n'+('Synthetic scheduled activity with a useful description. '.repeat(4))});if(++n===8){clearInterval(timer);finish();}},45);
 }}),{headers:{'Content-Type':'application/x-ndjson'}});
};
window.ui=createAssistant();document.dispatchEvent(new Event('campus-enter'));
for(const type of ['keydown','keyup','pointerdown','pointerup','wheel'])document.addEventListener(type,e=>window.mapEvents.push(e.type));
</script></body></html>`;
async function geometry(page, stage) {
 const metrics=await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
  const p=document.querySelector('.assistant-panel'),t=document.querySelector('.assistant-transcript'),f=document.querySelector('.assistant-form'),i=document.querySelector('textarea'),s=document.querySelector('.assistant-send');
  const r=rect(s),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
  return {panel:rect(p),transcript:rect(t),form:rect(f),input:rect(i),send:r,clickable:s===hit||s.contains(hit),scrollable:t.scrollHeight>t.clientHeight,scrollGap:t.scrollHeight-t.clientHeight-t.scrollTop,panelOverflow:p.scrollWidth-p.clientWidth,viewport:{width:innerWidth,height:innerHeight}};
 });
 check(metrics.panel.top>=0 && metrics.panel.bottom<=metrics.viewport.height+.5,`${stage}: panel bounds ${JSON.stringify(metrics)}`);
 check(metrics.transcript.bottom<=metrics.form.top+.5,`${stage}: transcript must be above composer ${JSON.stringify(metrics)}`);
 check(metrics.input.top>=metrics.panel.top && metrics.input.bottom<=metrics.panel.bottom+.5,`${stage}: textarea clipped ${JSON.stringify(metrics)}`);
 check(metrics.send.bottom<=metrics.panel.bottom+.5 && metrics.send.right<=metrics.panel.right+.5 && metrics.clickable,`${stage}: send clipped/not hittable ${JSON.stringify(metrics)}`);
 check(metrics.panelOverflow<=1,`${stage}: horizontal overflow ${JSON.stringify(metrics)}`);
 return metrics;
}
async function sampleStreaming(page) {
 const frames=await page.evaluate(async()=>{
  const frames=[];
  for(let n=0;n<24;n++){
   await new Promise(requestAnimationFrame);
   const p=document.querySelector('.assistant-panel').getBoundingClientRect(),i=document.querySelector('textarea').getBoundingClientRect(),s=document.querySelector('.assistant-send').getBoundingClientRect();
   frames.push({panelBottom:p.bottom,inputBottom:i.bottom,sendBottom:s.bottom});
  }
  return frames;
 });
 check(frames.every(f=>f.inputBottom<=f.panelBottom+.5&&f.sendBottom<=f.panelBottom+.5),`stream-frame clipping: ${JSON.stringify(frames)}`);
 return {frames:frames.length,maxInputOverflow:Math.max(...frames.map(f=>f.inputBottom-f.panelBottom)),maxSendOverflow:Math.max(...frames.map(f=>f.sendBottom-f.panelBottom))};
}
async function ready(page,baseUrl,size){
 await page.setViewportSize(size);await page.goto(baseUrl+'/__feedback_check');await page.waitForFunction(()=>document.querySelector('.assistant-service')?.dataset.connected==='true');
 await page.getByRole('button',{name:'Open campus assistant'}).click();await page.waitForTimeout(420);
}
try {
 await server.listen();receipt.port=server.httpServer.address().port;const baseUrl=`http://127.0.0.1:${receipt.port}`;
 console.log(`Synthetic Vite fixture: ${baseUrl}`);
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>receipt.errors.push(e.message));
 await page.route('**/__feedback_check',r=>r.fulfill({contentType:'text/html',body:fixture}));
 const external=[];page.on('request',request=>{if(!request.url().startsWith(baseUrl)&&!request.url().startsWith('data:'))external.push(request.url());});
 for(const size of [{width:1280,height:844},{width:390,height:844},{width:390,height:480}]){
  await ready(page,baseUrl,size);const stages=[];
  await page.locator('textarea').fill('Initial multiline synthetic draft\n'.repeat(8));stages.push({stage:'initial-multiline-growth',metrics:await geometry(page,'initial multiline'),animation:await sampleStreaming(page)});await page.locator('textarea').fill('');await page.waitForTimeout(320);
  for(let turn=0;turn<3;turn++){
   await page.locator('textarea').fill(`Synthetic question ${turn+1}`);await page.getByRole('button',{name:'Send message',exact:true}).click();
   await page.getByRole('button',{name:'Stop generating'}).waitFor();stages.push({stage:`stream-${turn}`,metrics:await geometry(page,'streaming'),animation:await sampleStreaming(page)});
   await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply complete.');await page.waitForTimeout(320);
   const metrics=await geometry(page,'completed');assert(metrics.scrollable);assert(metrics.scrollGap<2,JSON.stringify(metrics));stages.push({stage:`done-${turn}`,metrics});
  }
  const links=await page.locator('.assistant-assistant').last().locator('.assistant-sources a').evaluateAll(links=>links.map(a=>({text:a.textContent,href:a.getAttribute('href'),rel:a.rel,target:a.target})));
  assert.equal(links.length,3);assert.deepEqual(links.map(l=>l.href),sources.slice(0,3).map(s=>s.url));
  assert.match(links[0].text,/miro board/i);assert.match(links[1].text,/miro board/i);assert.equal(links[2].text,'Fall planning board');assert(links.every(l=>l.rel.includes('noopener')&&l.rel.includes('noreferrer')&&l.target==='_blank'));
  await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(120);assert.equal(await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop),0);
  await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.locator('textarea').fill('Synthetic multiline draft\n'.repeat(8));await page.waitForTimeout(320);
  const picker=page.locator('input[type=file]');await picker.setInputFiles(Array.from({length:4},(_,i)=>({name:`synthetic-${i}-long-name.txt`,mimeType:'text/plain',buffer:Buffer.from('Synthetic notes')})));
  await page.getByRole('button',{name:'Remove synthetic-3-long-name.txt'}).waitFor();
  await picker.setInputFiles([{name:'unsupported.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')}]);await page.getByRole('alert').waitFor();await page.waitForTimeout(320);
  stages.push({stage:'multiline-four-uploads-validation-error',metrics:await geometry(page,'multiline/upload/error')});
  await page.screenshot({path:`${evidence}/composer-${size.width}x${size.height}.png`});
  if(size.height===844){
   for(const height of [480,300]){await page.setViewportSize({width:390,height});await page.waitForTimeout(320);stages.push({stage:`dynamic-shrink-${height}`,metrics:await geometry(page,`dynamic shrink ${height}`)});await page.screenshot({path:`${evidence}/shrink-from-${size.width}-to-390x${height}.png`});}
   await page.setViewportSize(size);await page.waitForTimeout(320);
  }
  await page.evaluate(()=>window.mode='fail');await page.getByRole('button',{name:'Send message',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='The reply could not finish.');await page.waitForTimeout(320);
  assert.match(await page.locator('textarea').inputValue(),/Synthetic multiline draft/);assert.equal(await page.locator('.assistant-attachment').count(),4);stages.push({stage:'failed-draft-restored',metrics:await geometry(page,'failed draft')});
  await page.evaluate(()=>window.mode='hold');await page.locator('textarea').fill('Synthetic stop');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Stop generating'}).waitFor();
  assert.equal(await page.locator('.assistant-send').evaluate(e=>getComputedStyle(e,'::before').animationName),'assistant-send-spin');
  await page.locator('.assistant-transcript').hover();await page.mouse.wheel(0,-20000);await page.waitForTimeout(100);await page.evaluate(()=>window.sendPartial({type:'delta',text:'Synthetic streamed update while reading history.'}));await page.waitForTimeout(100);assert.equal(await page.locator('.assistant-transcript').evaluate(e=>e.scrollTop),0);
  await page.getByRole('button',{name:'Stop generating'}).click();await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply stopped.');assert(await page.evaluate(()=>window.calls.at(-1).signal.aborted));
  await page.locator('textarea').fill('Synthetic hidden completion');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Stop generating'}).waitFor();
  await page.locator('textarea').fill('Synthetic retained unsent draft');await page.getByRole('button',{name:'Close assistant'}).click();await page.locator('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.calls.at(-1).signal.aborted),false);
  await page.evaluate(()=>window.finishReply());await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply complete.');await page.getByRole('button',{name:'Open campus assistant'}).click();await page.waitForTimeout(420);
  assert.equal(await page.locator('textarea').inputValue(),'Synthetic retained unsent draft');assert.match(await page.locator('.assistant-assistant').last().textContent(),/Final synthetic detail/);stages.push({stage:'hidden-completed-reopened',metrics:await geometry(page,'reopened')});
  receipt.scenarios.push({size,stages,sourceLinks:links,manualScroll:true,animatedStop:true,abort:true,hiddenCompletion:true,draftRetention:true});
 }
 // OS-specific label/ARIA plus actual trusted keyboard events in fresh browser pages.
 for(const platform of [{navigator:'MacIntel',hint:'macOS',label:'⌘ K',aria:'Meta+K',key:'Meta+k'},{navigator:'Win32',hint:'Windows',label:'Ctrl K',aria:'Control+K',key:'Control+k'},{navigator:'Linux x86_64',hint:'Linux',label:'Ctrl K',aria:'Control+K',key:'Control+k'}]){
  await page.addInitScript(p=>{Object.defineProperty(navigator,'platform',{value:p.navigator,configurable:true});Object.defineProperty(navigator,'userAgentData',{value:{platform:p.hint},configurable:true});},platform);
  await page.setViewportSize({width:1280,height:844});await page.goto(baseUrl+'/__feedback_check');await page.waitForFunction(()=>document.querySelector('.assistant-service')?.dataset.connected==='true');
  assert.equal(await page.locator('.assistant-shortcut').textContent(),platform.label);assert.equal(await page.locator('.assistant-launcher').getAttribute('aria-keyshortcuts'),platform.aria);
  await page.keyboard.press(platform.key);await page.locator('dialog').waitFor({state:'visible'});await page.waitForTimeout(420);assert(await page.locator('textarea').evaluate(e=>e===document.activeElement));
  await page.evaluate(()=>window.mapEvents=[]);await page.keyboard.type('Synthetic k');await page.keyboard.press('Shift+Enter');await page.keyboard.press('ArrowUp');await page.locator('textarea').click();await page.mouse.wheel(0,20);assert.deepEqual(await page.evaluate(()=>window.mapEvents),[]);
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});receipt.scenarios.push({platform:platform.hint,label:platform.label,aria:platform.aria,shortcutOpensAndFocuses:true,modalEventsIsolated:true});
 }
 assert.deepEqual(external,[]);assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.findings,[], 'Layout acceptance findings');receipt.pass=true;console.log(JSON.stringify({pass:true,scenarios:receipt.scenarios.length,port:receipt.port,externalRequests:external.length}));
} catch(error){receipt.pass=false;receipt.failure=error.stack;console.error(error);process.exitCode=1;}
finally{await writeFile(`${evidence}/browser-receipt.json`,JSON.stringify(receipt,null,2)+'\n');await browser?.close();await server.close();}
