import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {STARTUP_REVEAL} from '../../../src/startup-visual.js';
const out='evidence/m43-smooth-reveal/speed225';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage();
let release;const gate=new Promise(r=>release=r);let held=false;
const report={url:'http://127.0.0.1:5173',chrome:browser.version(),checks:[],limitations:['Main module deliberately held; natural map/reveal/performance suites were not rerun for the duration-only edit.','Headless installed Chrome; no physical-device frame-rate claim.'],errors:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false},channels:[]}}));
await page.route(/\/src\/main\.js(?:\?|$)/,async r=>{held=true;await gate;await r.abort().catch(()=>{});});
const sample=()=>page.locator('.startup-color-disc').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return {duration:s.animationDuration,direction:s.animationDirection,timing:s.animationTimingFunction,iterations:s.animationIterationCount,name:s.animationName,state:s.animationPlayState,transform:s.transform,background:s.backgroundImage,width:s.width,height:s.height,left:s.left,top:s.top,mask:getComputedStyle(n.parentElement).maskImage};}));
try{
 await page.goto(report.url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#startup-brand')?.dataset.static==='false'&&[...document.querySelectorAll('#startup-mask-outer,#startup-mask-inner,#startup-logo')].every(n=>n.complete&&n.naturalWidth));
 for(let i=0;i<100&&!held;i++)await page.waitForTimeout(20);
 assert(held,'real main module was not held');
 report.initial=await sample();
 assert.equal(report.initial.length,2);
 for(const [i,s] of report.initial.entries()){assert(Math.abs(parseFloat(s.duration)-1.4222222222)<.00001);assert.equal(s.direction,i?'reverse':'normal');assert.equal(s.timing,'linear');assert.equal(s.iterations,'infinite');assert.equal(s.state,'running');}
 const app=await page.locator('#app').evaluate(n=>({inert:n.inert,state:n.dataset.state}));assert.equal(app.state,'loading');assert.equal(app.inert,true);report.heldApp=app;
 await page.locator('#startup-brand').screenshot({path:out+'/normal-0.png'});
 await page.waitForTimeout(400);report.later=await sample();await page.locator('#startup-brand').screenshot({path:out+'/normal-400.png'});
 for(let i=0;i<2;i++)assert.notEqual(report.initial[i].transform,report.later[i].transform);
 report.checks.push({name:'Both runtime discs are1.422222s linear infinite, opposite directions and advance while real main import is held',pass:true});
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 report.reduced=await sample();for(const s of report.reduced)assert.equal(s.name,'none');
 report.reducedMaskVisibility=await page.locator('.startup-motion').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).display));assert.deepEqual(report.reducedMaskVisibility,['none','none']);
 await page.locator('#startup-brand').screenshot({path:out+'/reduced-0.png'});await page.waitForTimeout(400);await page.locator('#startup-brand').screenshot({path:out+'/reduced-400.png'});
 report.checks.push({name:'Live reduced motion removes both animations and hides motion layers',pass:true});
 assert.deepEqual(STARTUP_REVEAL,{logoMilliseconds:1100,backdropMilliseconds:1000});report.reveal=STARTUP_REVEAL;report.previousPeriodSeconds=2.1333333333;report.actualPeriodSeconds=parseFloat(report.initial[0].duration);report.speedRatio=report.previousPeriodSeconds/report.actualPeriodSeconds;
 report.checks.push({name:'Reveal constants remain1100ms logo and1000ms backdrop',pass:true});
 report.hashes={};for(const p of ['src/startup-visual.js','src/map-startup.js','src/bootstrap.js','assets/branding/tech-at-loading-outer-mask.svg','assets/branding/tech-at-loading-inner-mask.svg','assets/branding/tech-at-flat-pastel-v5.svg','assets/branding/favicon.svg','assets/branding/favicon.ico'])report.hashes[p]=createHash('sha256').update(await fs.readFile(p)).digest('hex');
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await context.close();release();await browser.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.pass?'PASS focused speed225 Chrome probe':report.failure);}
