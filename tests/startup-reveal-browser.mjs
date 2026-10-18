import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const url=process.env.MAP_URL??'http://127.0.0.1:5173',out=process.env.MAP_EVIDENCE??'evidence/m43-smooth-reveal';
await fs.mkdir(out+'/screencast',{recursive:true});
const viewport=process.env.MAP_MOBILE==='true'?{width:390,height:844}:{width:1440,height:1000};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport,deviceScaleFactor:process.env.MAP_DPR2==='true'?2:1}),page=await context.newPage();
const report={url,viewport,chrome:browser.version(),errors:[],responses:[],frames:[],checks:[],limitations:['Isolated headless installed Chrome; frame/callback timing is diagnostic, not a physical-device FPS claim.','API routes intercepted. Screencast records compositor pixels in addition to main-thread transform samples.']},writes=[];
await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false},channels:[]}}));
page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(/mask\.svg(?:\?|$)/.test(r.url()))report.responses.push({url:r.url(),status:r.status()});});
let release;const gate=new Promise(r=>release=r);let held=false;
if(process.env.MAP_HOLD==='true')await page.route('**/*.glb',async r=>{if(!held){held=true;await gate;}return r.continue();});
await page.addInitScript(()=>{
 const trace=window.__startupTrace={samples:[],presented:[],longtasks:[],states:[],mutations:[]};
 const wall=()=>performance.timeOrigin+performance.now();let lastSample=0,lastState;
 try{new PerformanceObserver(list=>{for(const e of list.getEntries())trace.longtasks.push({wall:performance.timeOrigin+e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
 let lastMutation;
 new MutationObserver(()=>{const app=document.querySelector('#app'),notice=document.querySelector('#startup-notice');if(!app||!notice)return;const state={app:app.dataset.state,phase:notice.dataset.phase,hidden:notice.hidden},signature=JSON.stringify(state);if(signature!==lastMutation){trace.mutations.push({wall:wall(),...state});lastMutation=signature;}}).observe(document,{subtree:true,attributes:true,attributeFilter:['data-state','data-phase','hidden']});
 function sample(t){const notice=document.querySelector('#startup-notice'),brand=document.querySelector('#startup-brand'),app=document.querySelector('#app'),discs=[...document.querySelectorAll('.startup-color-disc')];if(discs.length&&brand&&notice&&app&&t-lastSample>35){lastSample=t;const style=getComputedStyle(brand),ns=getComputedStyle(notice),matrix=new DOMMatrixReadOnly(style.transform),box=brand.getBoundingClientRect(),state={app:app.dataset.state,phase:notice.dataset.phase,hidden:notice.hidden};if(!trace.layout){const caption=document.querySelector('#startup-status'),cs=getComputedStyle(caption),cb=caption.getBoundingClientRect();trace.layout={brand:{x:box.x,y:box.y,width:box.width,height:box.height},caption:{width:cb.width,height:cb.height,clipPath:cs.clipPath}};}const signature=JSON.stringify(state);if(signature!==lastState){trace.states.push({wall:wall(),...state});lastState=signature;}trace.samples.push({wall:wall(),...state,inert:app.inert,scale:matrix.a,logoOpacity:+style.opacity,whiteOpacity:+ns.opacity,box:{x:box.x,y:box.y,width:box.width,height:box.height},static:brand.dataset.static,discs:discs.map(n=>({transform:getComputedStyle(n).transform,currentTime:n.getAnimations()[0]?.currentTime,playState:n.getAnimations()[0]?.playState}))});}requestAnimationFrame(sample);}requestAnimationFrame(sample);
});
const cdp=await context.newCDPSession(page);await cdp.send('Page.enable');
if(process.env.MAP_PROFILE==='true'){await cdp.send('Profiler.enable');await cdp.send('Profiler.start');}
cdp.on('Page.screencastFrame',event=>{const i=report.frames.length,filename='screencast/'+String(i).padStart(4,'0')+'.jpg';report.frames.push({wall:Date.now(),filename,metadata:event.metadata});writes.push(fs.writeFile(out+'/'+filename,Buffer.from(event.data,'base64')));void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});});
try{
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1440,maxHeight:1000,everyNthFrame:1});
 await page.goto(url,{waitUntil:'commit'});
 if(process.env.MAP_HOLD==='true'){await page.waitForFunction(()=>document.querySelector('#map canvas'),null,{timeout:30000});await page.waitForTimeout(650);await page.screenshot({path:out+'/held-loading.png'});if(process.env.MAP_BLOCK==='true')report.deliberateBlock=await page.evaluate(()=>{const start=performance.timeOrigin+performance.now(),end=performance.now()+650;while(performance.now()<end){}return{start,end:performance.timeOrigin+performance.now()};});release();}
 await page.waitForFunction(()=>document.querySelector('#app')?.dataset.state==='entered',null,{timeout:120000});
 await page.waitForTimeout(180);report.trace=await page.evaluate(()=>window.__startupTrace);report.final=await page.evaluate(()=>({videoElements:document.querySelectorAll('video').length,masks:[...document.querySelectorAll('.startup-motion')].map(n=>getComputedStyle(n).maskImage),app:document.querySelector('#app').dataset.state,landmarks:window.__map?.snapshot().landmarks.length}));
 await page.screenshot({path:out+'/entered-map.png'});
 const states=report.trace.mutations,ready=states.find(s=>s.app==='ready'&&s.phase==='logo-exit'),back=states.find(s=>s.phase==='backdrop-exit'),entered=states.find(s=>s.app==='entered');assert(ready&&back&&entered,'Missing ordered actual startup phases');assert(back.wall-ready.wall>=1000,'Logo exit too short');assert(entered.wall-back.wall>=900,'White exit too short');
 assert(report.trace.samples.filter(s=>s.app==='ready').every(s=>s.inert&&s.static==='false'&&s.discs.every(d=>d.playState==='running')));assert(report.trace.samples.filter(s=>s.phase==='logo-exit').every(s=>s.whiteOpacity>.999));assert.equal(report.final.videoElements,0);assert.equal(report.final.masks.length,2);assert.equal(report.final.landmarks,9);assert.deepEqual(report.errors,[]);const layout=report.trace.layout;assert(layout.caption.width<=1&&layout.caption.height<=1&&layout.caption.clipPath.includes('50%'));assert(layout.brand.width>=(viewport.width<=600?300:320));assert(Math.abs(layout.brand.x+layout.brand.width/2-viewport.width/2)<1);assert(Math.abs(layout.brand.y+layout.brand.height/2-viewport.height/2)<1);
 report.checks.push({name:'Actual startup ordered1100ms/1000ms reveal retains inert input and compositor colors',pass:true,detail:{ready,backdrop:back,entered}});
}catch(e){report.failure=e.stack;console.error(e.stack);process.exitCode=1;try{report.trace=await page.evaluate(()=>window.__startupTrace);}catch{}}
finally{release?.();await cdp.send('Page.stopScreencast').catch(()=>{});if(process.env.MAP_PROFILE==='true'){const profile=await cdp.send('Profiler.stop');await fs.writeFile(out+'/cpu-profile.json',JSON.stringify(profile));}await Promise.all(writes);await fs.writeFile(out+'/reveal-browser-results.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({checks:report.checks,failure:report.failure,frames:report.frames.length,longtasks:report.trace?.longtasks},null,2));
