import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const url=process.env.MAP_URL??'http://127.0.0.1:4173';
const report=[];
const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details';fs.mkdirSync(out,{recursive:true});
async function check(name,fn){const page=await browser.newPage({viewport:{width:1200,height:900}});try{report.push({name,pass:true,detail:await fn(page)});}catch(e){report.push({name,pass:false,error:e.message});}finally{await page.close();}}
await check('asset failure is visible and remaining campus loads',async page=>{
  await page.route('**/*bobst-library*.glb',r=>r.abort('failed'));
  await page.goto(url);await page.waitForFunction(()=>window.__map?.snapshot().status==='partial');
  const state=await page.evaluate(()=>window.__map.snapshot());
  assert.equal(state.failed.length,1);assert.equal(state.loaded,state.navigation.loadedTileCount+11);
  assert.ok(await page.locator('#errors').isVisible());assert.match(await page.locator('#error-list').textContent(),/bobst/);
  await page.locator('#errors summary').click();await page.screenshot({path:`${out}/05-asset-failure.png`});
  return {loaded:state.loaded,failed:state.failed};
});
await check('resize while assets are pending updates final canvas',async page=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/*.glb',async route=>{await gate;await route.continue();});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#map canvas').waitFor();
  const loading=await page.locator('#status').textContent();
  await page.setViewportSize({width:390,height:844});release();
  await page.waitForFunction(()=>window.__map?.snapshot().status==='ready');
  const dimensions=await page.locator('#map canvas').evaluate(e=>({w:e.clientWidth,h:e.clientHeight}));
  assert.deepEqual(dimensions,{w:390,h:844});return {loading,dimensions};
});
await check('missing WebGL gives user-readable status',async page=>{
  await page.addInitScript(()=>{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:getContext.call(this,type,...args);};});
  await page.goto(url);await page.waitForFunction(()=>document.getElementById('status').textContent.includes('WebGL'));
  return await page.locator('#status').textContent();
});
await browser.close();fs.writeFileSync(`${out}/failure-results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.some(r=>!r.pass))process.exitCode=1;
