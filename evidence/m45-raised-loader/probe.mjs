import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out=process.env.RELIEF_EVIDENCE??'evidence/m45-raised-loader',base='http://127.0.0.1:5173';
await fs.mkdir(out,{recursive:true});
const source=await fs.readFile('index.html','utf8'),preview=await fs.readFile('assets/branding/tech-at-raised-v7-preview.html','utf8');
assert.equal(source.match(/<style>([\s\S]*?)<\/style>/)[1].trim(),preview.match(/<style>([\s\S]*?)<\/style>/)[1].trim(),'Preview CSS differs from runtime');
for(const name of ['tech-at-flat-pastel-v5.svg','tech-at-loading-outer-mask.svg','tech-at-loading-inner-mask.svg','tech-at-raised-relief-v7.svg'])assert(source.includes(name)&&preview.includes(name));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={chrome:browser.version(),previewUrl:base+'/assets/branding/tech-at-raised-v7-preview.html',sourceEquivalentCss:true,cases:[],errors:[]};
try{
 for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport,deviceScaleFactor:2}),page=await context.newPage();
  await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false}}}));page.on('pageerror',e=>report.errors.push(String(e)));
  await page.goto(report.previewUrl);await page.waitForFunction(()=>[...document.images].every(n=>n.complete&&n.naturalWidth));
  const styles=await page.locator('.startup-color-disc').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return{duration:s.animationDuration,direction:s.animationDirection,timing:s.animationTimingFunction,iterations:s.animationIterationCount,background:s.backgroundImage,mask:getComputedStyle(n.parentElement).maskImage};}));
  styles.forEach((s,i)=>{assert(Math.abs(parseFloat(s.duration)-1.4222222222)<.00001);assert.equal(s.direction,i?'reverse':'normal');assert.equal(s.timing,'linear');assert.equal(s.iterations,'infinite');});
  const periods=await page.evaluate(()=>document.getAnimations().map(a=>{a.pause();return a.effect.getTiming().duration;}));assert.equal(periods.length,2);assert(periods.every(t=>Math.abs(t-1422.2222222)<.001));
  const phases=[];
  for(const fraction of [0,.25,.5,.75,1]){await page.evaluate(f=>{for(const a of document.getAnimations())a.currentTime=a.effect.getTiming().duration*f;},fraction);await page.waitForTimeout(30);const file=name+'-phase-'+fraction+'.png';await page.locator('#startup-brand').screenshot({path:out+'/'+file});phases.push({fraction,file,transforms:await page.locator('.startup-color-disc').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).transform))});}
  await page.evaluate(()=>{for(const a of document.getAnimations()){a.currentTime=0;}document.querySelector('.startup-relief').style.visibility='hidden';});await page.locator('#startup-brand').screenshot({path:out+'/'+name+'-flat-comparison.png'});await page.evaluate(()=>{document.querySelector('.startup-relief').style.visibility='visible';for(const a of document.getAnimations()){a.currentTime=0;a.play();}});await page.waitForTimeout(100);await page.screenshot({path:out+'/'+name+'-preview.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);const reduced=await page.locator('.startup-color-disc').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).animationName));assert.deepEqual(reduced,['none','none']);
  await page.locator('#startup-brand').screenshot({path:out+'/'+name+'-reduced-0.png'});await page.waitForTimeout(400);await page.locator('#startup-brand').screenshot({path:out+'/'+name+'-reduced-400.png'});
  report.cases.push({name,viewport,dpr:2,styles,periods,phases,reduced});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{await browser.close();await fs.writeFile(out+'/preview-results.json',JSON.stringify(report,null,2)+'\n');console.log(report.pass?'PASS desktop/mobile source-equivalent loop preview':report.failure);}
