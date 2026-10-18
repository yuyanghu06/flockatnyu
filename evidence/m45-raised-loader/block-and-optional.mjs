import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='evidence/m45-raised-loader',base='http://127.0.0.1:5173';
await fs.mkdir(out+'/block-frames',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={chrome:browser.version(),checks:[],frames:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage();
 await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false},channels:[]}}));
 const cdp=await context.newCDPSession(page),writes=[];await cdp.send('Page.enable');
 cdp.on('Page.screencastFrame',e=>{const filename='block-frames/'+String(report.frames.length).padStart(4,'0')+'.jpg';report.frames.push({filename,wall:e.metadata.timestamp*1000});writes.push(fs.writeFile(out+'/'+filename,Buffer.from(e.data,'base64')));void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
 await page.goto(base+'/assets/branding/tech-at-raised-v7-preview.html');await page.waitForFunction(()=>[...document.images].every(n=>n.complete&&n.naturalWidth));
 report.brand=await page.locator('#startup-brand').boundingBox();await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,everyNthFrame:1});await page.waitForTimeout(250);
 report.block=await page.evaluate(()=>{const start=performance.timeOrigin+performance.now(),until=performance.now()+650;while(performance.now()<until){}return{start,end:performance.timeOrigin+performance.now()};});
 await page.waitForTimeout(150);await cdp.send('Page.stopScreencast');await Promise.all(writes);report.framesDuringBlock=report.frames.filter(f=>f.wall>report.block.start&&f.wall<report.block.end);assert(report.framesDuringBlock.length>=2,'No compositor image pair during blocked JS');
 report.checks.push({name:'Compositor presents actual images with static SVG filter overlay during650ms JS block',pass:true,frames:report.framesDuringBlock.length});await context.close();
 const missing=await browser.newContext({viewport:{width:1200,height:900}}),p=await missing.newPage();
 await p.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false},channels:[]}}));p.on('pageerror',e=>report.errors.push(String(e)));
 await p.route(base+'/',async route=>{const response=await route.fetch(),html=await response.text();let replaced=false;const changed=html.replace(/(<img\b[^>]*class="startup-relief"[^>]*src=")[^"]+("[^>]*>)/,(_,a,b)=>{replaced=true;return a+'/__missing_optional_relief.svg'+b;});assert(replaced,'Optional image fixture was not applied');await route.fulfill({response,body:changed});});
 await p.route('**/__missing_optional_relief.svg',r=>r.fulfill({status:404,body:'missing optional relief'}));
 await p.goto(base+'/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.querySelector('.startup-relief')?.hidden===true);await p.waitForFunction(()=>document.querySelector('#app')?.dataset.state==='entered',null,{timeout:120000});
 report.optional404=await p.evaluate(()=>({overlayHidden:document.querySelector('.startup-relief').hidden,app:document.querySelector('#app').dataset.state,inert:document.querySelector('#app').inert,landmarks:window.__map.snapshot().landmarks.length}));assert.deepEqual(report.optional404,{overlayHidden:true,app:'entered',inert:false,landmarks:9});assert.deepEqual(report.errors,[]);await p.screenshot({path:out+'/optional-relief-404-entered.png'});await missing.close();report.checks.push({name:'Actual optional relief404 hides only overlay and real startup enters with9landmarks',pass:true});report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await browser.close();await fs.writeFile(out+'/block-and-optional-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.pass?'PASS block and optional relief fallback':report.failure);}
