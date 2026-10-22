import { goGreekPopup } from '../src/go-greek-popup.js';
const expectedLandmarkCount = 9 + Number(goGreekPopup.enabled);
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const url=process.env.MAP_URL??'http://127.0.0.1:4181',out=process.env.MAP_EVIDENCE??'evidence/m41-brand-loader';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={url,chrome:browser.version(),checks:[],failures:[],limitations:['Headless installed Chrome; emulated mobile viewport, no physical touch/GPU measurement.','All API routes intercepted; no live backend/model calls.','Broken image test overrides only the HTML image URL to request a missing resource because the production SVG is bundled inline.','Watchdog test accelerates only the120000ms timer to1000ms; source timeout remains unchanged.']};
const check=async(name,fn)=>{if(process.env.BRAND_CHECK_MATCH&&!new RegExp(process.env.BRAND_CHECK_MATCH).test(name))return;try{const detail=await fn();report.checks.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){report.checks.push({name,pass:false,error:e.stack});report.failures.push(name);console.error('FAIL '+name+' '+e.message);}};
const snap=page=>page.evaluate(()=>window.__map.snapshot());
async function fixture({viewport={width:1440,height:1000},mode='held-model',reducedMotion='no-preference',javaScriptEnabled=true}={}){
 const context=await browser.newContext({viewport,reducedMotion,javaScriptEnabled}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false}}}));
 let release,held=false;const gate=new Promise(resolve=>release=resolve);
 if(mode==='watchdog')await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===120000?1000:ms,...args);});
 if(mode==='broken-image'){
  await page.route(url+'/',async r=>{const response=await r.fetch();let html=await response.text();html=html.replace(/(<img id="startup-logo" src=")[^"]+/, '$1/__missing_brand__.svg');await r.fulfill({response,body:html});});
  await page.route('**/__missing_brand__.svg',r=>r.abort('failed'));
 }
 await page.route('**/*.js',async r=>{
  const pathname=new URL(r.request().url()).pathname;
  const entry=/\/assets\/map-(?!startup)[^/]+\.js$/.test(pathname)||pathname==='/src/bootstrap.js';
  const main=/\/assets\/main-[^/]+\.js$/.test(pathname)||pathname==='/src/main.js';
  if(mode==='abort-bootstrap'&&entry)return r.abort('failed');
  if(mode==='abort-main'&&main)return r.abort('failed');
  if(mode==='held-bootstrap'&&entry){held=true;await gate;}
  return r.continue();
 });
 await page.route('**/*.glb',async r=>{if(['held-model','broken-image','watchdog','abort-model'].includes(mode)&&!held){held=true;await gate;if(mode==='abort-model')return r.abort('failed');}return r.continue();});
 await page.goto(url,{waitUntil:'commit'});await page.locator('#startup-notice').waitFor({state:'visible'});
 return {page,context,errors,release,held:()=>held};
}
const entered=page=>page.waitForFunction(()=>document.querySelector('#app').dataset.state==='entered',null,{timeout:90000});
const failed=page=>page.waitForFunction(()=>document.querySelector('#app').dataset.state==='failed',null,{timeout:15000});
async function assertFailure(page){await failed(page);assert(await page.locator('#startup-notice').isVisible());assert(await page.locator('#startup-logo').isHidden());assert(await page.locator('#startup-retry').isVisible());assert.equal(await page.locator('#app').evaluate(x=>x.inert),true);assert.equal(await page.locator('#app').getAttribute('aria-busy'),'false');assert.equal(await page.evaluate(()=>document.activeElement?.id),'startup-retry');assert.match(await page.locator('#startup-status').textContent(),/could not|Unable|stalled|failed/i);}
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}])await check('White fullscreen branded loading gates real model readiness '+viewport.width,async()=>{
  const f=await fixture({viewport});try{await f.page.waitForFunction(()=>document.querySelector('#map canvas'));await f.page.waitForTimeout(350);assert(f.held());assert(await f.page.locator('#startup-notice').isVisible());assert(await f.page.locator('#startup-logo').isVisible());assert.equal(await f.page.locator('#app').evaluate(x=>x.inert),true);assert.equal(await f.page.locator('#startup-notice').evaluate(x=>getComputedStyle(x).backgroundColor),'rgb(255, 255, 255)');assert.deepEqual(await f.page.locator('#startup-notice').boundingBox(),{x:0,y:0,...viewport});assert.equal(await f.page.locator('#loading-enter').count(),0);await f.page.screenshot({path:out+'/loading-'+viewport.width+'.png'});const time=Date.now();f.release();await entered(f.page);assert(await f.page.locator('#startup-notice').isHidden());assert.equal(await f.page.locator('#app').evaluate(x=>x.inert),false);const state=await snap(f.page);assert.equal(state.landmarks.length,expectedLandmarkCount);assert.deepEqual(state.failed,[]);assert.deepEqual(f.errors,[]);await f.page.screenshot({path:out+'/ready-'+viewport.width+'.png'});return {releaseToEnteredMs:Date.now()-time,loaded:state.loaded,landmarks:state.landmarks.length};}finally{f.release();await f.context.close();}
 });
 await check('Initial HTML shows animation before bootstrap JavaScript downloads',async()=>{const f=await fixture({mode:'held-bootstrap'});try{await f.page.locator('#startup-logo').waitFor({state:'visible'});assert(f.held());assert.equal(await f.page.evaluate(()=>typeof window.__map),'undefined');assert.equal(await f.page.locator('#app').evaluate(x=>x.inert),true);await f.page.screenshot({path:out+'/before-bootstrap.png'});f.release();await entered(f.page);return {initialLoaderVisible:true};}finally{f.release();await f.context.close();}});
 for(const mode of ['abort-model','abort-bootstrap','abort-main'])await check('Actual '+mode+' gives focused Retry and stops animation',async()=>{const f=await fixture({mode});try{f.release();await assertFailure(f.page);await f.page.screenshot({path:out+'/'+mode+'.png'});const status=await f.page.locator('#startup-status').textContent();if(mode==='abort-bootstrap'){await f.page.unroute('**/*.js');await Promise.all([f.page.waitForNavigation({waitUntil:'domcontentloaded'}),f.page.getByRole('button',{name:'Retry loading',exact:true}).click()]);await entered(f.page);assert(await f.page.locator('#startup-notice').isHidden());}return {status,retryReloadVerified:mode==='abort-bootstrap'};}finally{f.release();await f.context.close();}});
 await check('Watchdog is terminal even when real late asset responses finish',async()=>{const f=await fixture({mode:'watchdog'});try{await assertFailure(f.page);f.release();await f.page.waitForFunction(()=>window.__map?.snapshot().status==='partial'||window.__map?.snapshot().status==='ready',null,{timeout:90000});assert.equal(await f.page.locator('#app').evaluate(x=>x.dataset.state),'failed');assert.equal(await f.page.locator('#app').evaluate(x=>x.inert),true);assert(await f.page.locator('#startup-logo').isHidden());await f.page.screenshot({path:out+'/watchdog-late-assets.png'});return {status:await f.page.locator('#startup-status').textContent()};}finally{f.release();await f.context.close();}});
 await check('Broken decorative image retains status and allows actual readiness',async()=>{const f=await fixture({mode:'broken-image'});try{await f.page.waitForFunction(()=>document.querySelector('#startup-logo').hidden);assert(await f.page.locator('#startup-logo').isHidden());assert(await f.page.locator('#startup-status').isVisible());assert.equal(await f.page.locator('#app').evaluate(x=>x.inert),true);await f.page.screenshot({path:out+'/broken-image-fallback.png'});f.release();await entered(f.page);assert(await f.page.locator('#startup-notice').isHidden());return {entered:true};}finally{f.release();await f.context.close();}});
 await check('Late graphics failure restores useful retry and disables map',async()=>{const f=await fixture({mode:'normal'});try{await entered(f.page);await f.page.locator('#map canvas').dispatchEvent('webglcontextlost');await assertFailure(f.page);await f.page.screenshot({path:out+'/late-context-loss.png'});return {status:await f.page.locator('#startup-status').textContent()};}finally{await f.context.close();}});
 await check('Disabled JavaScript shows a static explanation without endless animation',async()=>{const f=await fixture({mode:'normal',javaScriptEnabled:false});try{assert(await f.page.locator('noscript p').isVisible());assert(await f.page.locator('#startup-logo').isHidden());await f.page.screenshot({path:out+'/javascript-disabled.png'});return {explanation:await f.page.locator('noscript p').textContent()};}finally{await f.context.close();}});
 await check('Native SVG frame endpoints loop exactly with stationary silhouette',async()=>{
  const context=await browser.newContext({viewport:{width:640,height:640}}),page=await context.newPage();
  try{
   await page.goto(pathToFileURL(path.resolve('assets/branding/tech-at-loading-v5.svg')).href);
   await page.evaluate(()=>{document.documentElement.style.width='640px';document.documentElement.style.height='640px';});
   const sample=async time=>page.evaluate(time=>{for(const a of document.getAnimations()){a.pause();a.currentTime=time;}},time);
   const initial=await page.evaluate(()=>({animations:document.getAnimations().length,durations:document.getAnimations().map(a=>a.effect.getTiming().duration),path:document.querySelector('clipPath path').getAttribute('d'),clipTransform:document.querySelector('clipPath').getAttribute('transform'),segments:[...document.querySelectorAll('path.flow-segment')].map(n=>({route:n.dataset.route,u:+n.dataset.u,phase:+n.dataset.phase,offset:+n.parentElement.dataset.phaseOffset,d:n.getAttribute('d'),transform:getComputedStyle(n).transform,delay:n.getAnimations()[0].effect.getTiming().delay})),geometry:[...document.querySelectorAll('path.flow-segment')].map(n=>{const m=n.getCTM();return[n.getAttribute('d'),n.getAttribute('transform'),m.a,m.b,m.c,m.d,m.e,m.f];})}));
   assert.equal(initial.animations,192);assert.equal(initial.segments.length,192);assert(initial.durations.every(n=>Math.abs(n-3200/1.5)<.00001),'Requested50-percent-faster cycle');
   const period=initial.durations[0],times=[0,period/4,period/2,period*3/4,period];
   const routeStats={};
   for(const [route,count] of [['outer',128],['inner',64]]){
    const segments=initial.segments.filter(s=>s.route===route);assert.equal(segments.length,count);
    for(let i=0;i<segments.length;i++){
     const n=segments[i];assert.equal(n.transform,'none','No global/segment motion');assert(n.u>0&&n.u<1);if(i)assert(n.u>segments[i-1].u,'Route phase order');
     const phaseResidual=(n.u+n.offset+n.phase)%1;assert(Math.min(phaseResidual,1-phaseResidual)<1e-6,'Spatial route phase');assert(Math.abs(n.delay+n.phase*period)<.001,'Delay matches route phase');
     const points=n.d.match(/-?\d+(?:\.\d+)?/g).map(Number);assert.equal(points.length,4);
     if(i){const prev=segments[i-1].d.match(/-?\d+(?:\.\d+)?/g).map(Number);assert(Math.hypot(prev[2]-points[0],prev[3]-points[1])<.002,'Contiguous route geometry');}
    }
    if(route==='inner'){const first=segments[0].d.match(/-?\d+(?:\.\d+)?/g).map(Number),last=segments.at(-1).d.match(/-?\d+(?:\.\d+)?/g).map(Number);assert(Math.hypot(first[0]-last[2],first[1]-last[3])<.002,'Closed inner loop');}
    const movements=[];
    for(const i of [0,Math.floor(count*.25),Math.floor(count*.5),Math.floor(count*.9)]){
     const j=(i+Math.floor(count/8))%count,delta=((segments[j].u-segments[i].u+1)%1)*period;
     await sample(0);const before=await page.locator('path.flow-segment[data-route="'+route+'"]').nth(i).evaluate(n=>getComputedStyle(n).stroke);
     await sample(delta);const after=await page.locator('path.flow-segment[data-route="'+route+'"]').nth(j).evaluate(n=>getComputedStyle(n).stroke);
     const a=before.match(/[\d.]+/g).map(Number),b=after.match(/[\d.]+/g).map(Number);assert(a.every((n,k)=>Math.abs(n-b[k])<=1),'Same color advances along '+route+' route');movements.push({from:i,to:j,deltaMs:delta,before,after});
    }
    routeStats[route]={count,movements};
   }
   for(const time of times){
    await sample(time);await page.screenshot({path:out+'/loop-'+time+'.png'});
    assert.equal(await page.locator('clipPath path').getAttribute('d'),initial.path);assert.equal(await page.locator('clipPath').getAttribute('transform'),initial.clipTransform);
    const geometry=await page.evaluate(()=>[...document.querySelectorAll('path.flow-segment')].map(n=>{const m=n.getCTM();return[n.getAttribute('d'),n.getAttribute('transform'),m.a,m.b,m.c,m.d,m.e,m.f];}));assert.deepEqual(geometry,initial.geometry,'Segment geometry and transforms remain fixed');
   }
   await fs.mkdir(out+'/motion-240',{recursive:true});await page.setViewportSize({width:240,height:240});await page.evaluate(()=>{document.documentElement.style.width='240px';document.documentElement.style.height='240px';});
   const colors=[];
   for(let frame=0;frame<64;frame++){await sample(frame*period/64);await page.screenshot({path:out+'/motion-240/'+String(frame).padStart(2,'0')+'.png'});colors.push(await page.evaluate(()=>['outer','inner'].map(route=>getComputedStyle(document.querySelector('path.flow-segment[data-route="'+route+'"]')).stroke.match(/[\d.]+/g).map(Number))));}
   let maxColorStep=0;for(let frame=1;frame<colors.length;frame++)for(let route=0;route<2;route++)for(let c=0;c<3;c++)maxColorStep=Math.max(maxColorStep,Math.abs(colors[frame][route][c]-colors[frame-1][route][c]));
   return {animations:initial.animations,duration:period,sourceBytes:(await fs.stat('assets/branding/tech-at-loading-v5.svg')).size,times,routes:routeStats,geometryFixed:true,transforms:'none',sampled240pxFrames:64,maxColorStep};
  }finally{await context.close();}
 });
 await check('Reduced motion uses static art and live changes resume or stop compositor colors',async()=>{
  const f=await fixture({reducedMotion:'reduce'});
  try{
   await f.page.waitForFunction(()=>document.querySelector('#startup-brand').dataset.static==='true');
   const first=await f.page.locator('#startup-brand').screenshot({path:out+'/reduced-poster-0.png'});await f.page.waitForTimeout(400);assert.deepEqual(first,await f.page.locator('#startup-brand').screenshot({path:out+'/reduced-poster-1.png'}));
   await f.page.emulateMedia({reducedMotion:'no-preference'});await f.page.waitForFunction(()=>document.querySelector('#startup-brand').dataset.static==='false');
   const moving=await f.page.locator('#startup-brand').screenshot({path:out+'/moving-colors-0.png'});await f.page.waitForTimeout(400);assert.notDeepEqual(moving,await f.page.locator('#startup-brand').screenshot({path:out+'/moving-colors-1.png'}));
   await f.page.emulateMedia({reducedMotion:'reduce'});await f.page.waitForFunction(()=>document.querySelector('#startup-brand').dataset.static==='true');const still=await f.page.locator('#startup-brand').screenshot({path:out+'/reduced-again-0.png'});await f.page.waitForTimeout(350);assert.deepEqual(still,await f.page.locator('#startup-brand').screenshot({path:out+'/reduced-again-1.png'}));
   f.release();await entered(f.page);return{staticPixelIdentical:true,compositorColorsMove:true,livePreferenceToggleVerified:true};
  }finally{f.release();await f.context.close();}
 });
}finally{await browser.close();await fs.writeFile(out+'/'+(process.env.BRAND_RESULT_NAME??'brand-loader-browser-results')+'.json',JSON.stringify(report,null,2)+'\n');}
if(report.failures.length)process.exitCode=1;
