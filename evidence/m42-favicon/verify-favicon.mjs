import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const out='evidence/m42-favicon',base=process.env.FAVICON_URL??'http://127.0.0.1:4184';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={chrome:browser.version(),checks:[],limitations:['Headless Chrome; favicon source/raster sizes inspected, browser tab-cache behavior not measured.','All browser API routes intercepted; no real backend/model calls.']};
const check=async(name,fn)=>{const detail=await fn();report.checks.push({name,pass:true,detail});console.log('PASS '+name);};
try{
 await check('Frozen SVG has no animation, delay, script or remote references',async()=>{
  const source=await fs.readFile('assets/branding/favicon.svg','utf8');
  assert(!/@keyframes|animation\s*:|animation-delay|<animate\b|<animateTransform\b|<set\b|<script\b/i.test(source));
  const context=await browser.newContext({viewport:{width:256,height:256}}),page=await context.newPage();
  try{
   await page.goto(pathToFileURL(path.resolve('assets/branding/favicon.svg')).href);
   const data=await page.evaluate(()=>({viewBox:document.documentElement.getAttribute('viewBox'),animations:document.getAnimations().length,external:[...document.querySelectorAll('*')].flatMap(n=>[...n.attributes].filter(a=>(a.localName==='href'||/url\(/.test(a.value))&&!a.value.startsWith('#')&&!/^url\(\s*['"]?#/.test(a.value)).map(a=>({name:a.name,value:a.value}))),colors:[...document.querySelectorAll('path')].map(n=>({d:n.getAttribute('d'),stroke:getComputedStyle(n).stroke})).filter(n=>n.stroke!=='none')}));
   assert.equal(data.animations,0);assert.deepEqual(data.external,[]);
   await page.evaluate(()=>{document.documentElement.style.width='256px';document.documentElement.style.height='256px';});
   const first=await page.screenshot({path:out+'/favicon-0.png'});await page.waitForTimeout(500);const last=await page.screenshot({path:out+'/favicon-500.png'});assert.deepEqual(first,last,'Static favicon pixels change');
   return data;
  }finally{await context.close();}
 });
 await check('Favicon preserves the actual current loader phase-zero colors and shape',async()=>{
  const target=report.checks[0].detail,context=await browser.newContext({viewport:{width:256,height:256}}),page=await context.newPage();
  try{
   await page.goto(pathToFileURL(path.resolve('assets/branding/tech-at-loading-v5.svg')).href);
   const colors=await page.evaluate(viewBox=>{for(const a of document.getAnimations()){a.pause();a.currentTime=0;}document.documentElement.setAttribute('viewBox',viewBox);document.documentElement.style.width='256px';document.documentElement.style.height='256px';return[...document.querySelectorAll('path')].map(n=>({d:n.getAttribute('d'),stroke:getComputedStyle(n).stroke})).filter(n=>n.stroke!=='none');},target.viewBox);
   assert.deepEqual(target.colors,colors,'Frozen colors differ from actual phase zero');await page.screenshot({path:out+'/loader-phase-zero-cropped.png'});
   return {matchingColoredPaths:colors.length,croppedViewBox:target.viewBox};
  }finally{await context.close();}
 });
 await check('Every production HTML entry publishes working SVG and ICO metadata',async()=>{
  const result=[];
  for(const entry of ['index.html','admin.html','docs/color-schemes.html']){
   const context=await browser.newContext({viewport:{width:1024,height:768}}),page=await context.newPage();
   await page.route('**/api/**',r=>r.fulfill({json:{chat:{configured:false},access:{allowed:false},channels:[]}}));
   try{
    const response=await page.goto(base+'/'+entry,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
    const icons=await page.locator('link[rel~="icon"]').evaluateAll(nodes=>nodes.map(n=>({href:n.href,type:n.type,sizes:n.getAttribute('sizes')})));
    assert(icons.some(n=>n.type==='image/svg+xml'));assert(icons.some(n=>/icon/.test(n.type)&&n.type!=='image/svg+xml'));
    const fetched=[];
    for(const icon of icons){assert(icon.href.startsWith(base+'/assets/'),'Production icon must resolve emitted local asset');const r=await context.request.get(icon.href);assert.equal(r.status(),200);const mime=r.headers()['content-type'];assert(icon.type==='image/svg+xml'?/image\/svg\+xml/.test(mime):/image\/(x-icon|vnd.microsoft.icon)/.test(mime));fetched.push({...icon,status:r.status(),mime,bytes:(await r.body()).length});}
    result.push({entry,icons:fetched});
   }finally{await context.close();}
  }
  return result;
 });
}catch(e){report.failure=e.stack;console.error(e.stack);process.exitCode=1;}finally{await browser.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(report,null,2)+'\n');}
