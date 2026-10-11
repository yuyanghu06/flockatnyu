import { chromium } from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
const url=process.env.MAP_URL??'http://127.0.0.1:4173';
const out=process.env.MAP_EVIDENCE??'evidence/m3-campus-details';
fs.mkdirSync(out,{recursive:true});
const report={environment:{os:os.platform(),release:os.release(),cpu:os.cpus()[0].model,url,viewport:[1440,1000],gpu:'ANGLE SwiftShader software WebGL'},checks:[],errors:[],failedRequests:[],responses:[]};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
report.environment.browser=browser.version();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror',e=>report.errors.push(e.message));
page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),failure:r.failure()}));
page.on('response',r=>{if(r.status()>=400)report.responses.push({url:r.url(),status:r.status()});});
async function snapshot(){return page.evaluate(()=>window.__map.snapshot());}
async function check(name,fn) {console.log('CHECK '+name);try {const detail=await fn();report.checks.push({name,pass:true,detail});}catch(e){report.checks.push({name,pass:false,error:e.stack});console.log('FAIL '+e.message);await page.evaluate(()=>document.querySelector('dialog[open]')?.close());}}
function sameCamera(a,b){assert.equal(a.projection,b.projection);for(const key of ['position','target'])for(let i=0;i<3;i++)assert.ok(Math.abs(a[key][i]-b[key][i])<1e-8,`${key}[${i}] differs`);for(const key of ['fov','near','far','zoom'])assert.ok(Math.abs(a[key]-b[key])<1e-8);}
async function settle(){await page.waitForTimeout(450);}
async function drag(x1,y1,x2,y2,button='left'){await page.mouse.move(x1,y1);await page.mouse.down({button});await page.mouse.move(x2,y2,{steps:12});await page.mouse.up({button});await settle();}
try {
  const start=Date.now();
  await page.goto(url);
  await page.waitForFunction(()=>window.__map?.snapshot().status==='ready',{},{timeout:120000});
  await settle();
  report.loadMs=Date.now()-start;
  report.initial=await snapshot();
  await page.screenshot({path:`${out}/02-campus-desktop.png`});
  await check('normal loading has no browser errors, missing requests or failed assets',async()=>{assert.equal(report.errors.length,0);assert.equal(report.failedRequests.length,0);assert.equal(report.responses.length,0);assert.equal(report.initial.failed.length,0);return {loaded:report.initial.loaded,loadMs:report.loadMs};});
  await check('landmark bounds preserve authoritative placement',async()=>{
    const arch=report.initial.landmarks.find(x=>x.id==='washington-square-arch').bounds;
    assert.ok(Math.abs(arch.max[1]-arch.min[1]-20.5)<1e-6);assert.ok(Math.abs(arch.min[1]-.68)<1e-6);
    assert.ok(Math.abs((arch.min[0]+arch.max[0])/2-19.191)<1e-5);
    const bobst=report.initial.landmarks.find(x=>x.id==='bobst-library').bounds;
    assert.ok(Math.abs(bobst.min[1]-2.688)<1e-5);
    const paulson=report.initial.landmarks.find(x=>x.id==='nyu-john-a-paulson-center').bounds;
    assert.ok(Math.abs(paulson.min[1]-2.4857)<1e-5);assert.ok(Math.abs(paulson.max[1]-paulson.min[1]-91)<1e-4);
    assert.equal(report.initial.removedColesTriangles,92);return {arch,bobst,paulson,removedColesTriangles:report.initial.removedColesTriangles};
  });
  await check('all landmarks selectable without moving camera',async()=>{
    const options=await page.locator('#building option').evaluateAll(elements=>elements.filter(e=>e.value).map(e=>({id:e.value,name:e.textContent})));
    assert.equal(options.length,report.initial.landmarks.length);assert.equal(options.length,9);
    for(const option of options){
      const before=(await snapshot()).camera;
      await page.selectOption('#building',option.id);await settle();
      assert.equal((await snapshot()).selected,option.id);
      assert.equal(await page.locator('#building-name').textContent(),option.name);
      sameCamera((await snapshot()).camera,before);
    }
    await page.click('#clear');return options;
  });
  await check('orbit, pan, zoom and reset respond to actual pointer input',async()=>{
    const initial=(await snapshot()).camera;
    await drag(900,400,1030,480);const orbit=(await snapshot()).camera;assert.notDeepEqual(orbit,initial);
    await drag(900,400,990,470,'right');const pan=(await snapshot()).camera;assert.notDeepEqual(pan,orbit);
    await page.mouse.wheel(0,-450);await settle();const zoom=(await snapshot()).camera;assert.notDeepEqual(zoom,pan);
    await page.click('#reset');await settle();sameCamera((await snapshot()).camera,initial);
    return {initial,orbit,pan,zoom};
  });
  await check('camera export restore and invalid input are safe',async()=>{
    await drag(900,400,980,440);await page.click('#camera-open');
    const saved=await page.inputValue('#camera-json');const config=JSON.parse(saved);
    assert.ok(config.position && config.target);
    await page.fill('#camera-json','not json');await page.click('#camera-restore');
    const invalidMessage=await page.locator('#camera-message').textContent();assert.match(invalidMessage,/invalid|valid|JSON|could|expected/i);
    await page.locator('#camera-dialog .close').click();await page.click('#reset');await settle();
    await page.click('#camera-open');await page.fill('#camera-json',saved);await page.click('#camera-restore');await settle();
    const restored=(await snapshot()).camera;sameCamera(restored,config);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('Test denied clipboard'))}}));
    await page.click('#camera-copy');const fallback=await page.locator('#camera-message').textContent();
    assert.ok((await page.inputValue('#camera-json')).length>40);assert.match(fallback,/select|copy|clipboard/i);
    await page.locator('#camera-dialog .close').click();await page.click('#reset');await settle();return {config,restored,invalidMessage,fallback};
  });
  await check('Paulson focused screenshot',async()=>{
    await page.selectOption('#building','nyu-john-a-paulson-center');await page.click('#focus');await page.waitForTimeout(1300);
    await page.screenshot({path:`${out}/03-paulson-selected.png`});return await snapshot();
  });
  await check('camera boundary configurations can restore',async()=>{
    const base=report.initial.camera;
    const maximum=report.initial.navigation.cameraLimits.maxDistance;
    const positions=[[maximum*.6,12+maximum*.8,170],[0,27,170],[0,12+15*Math.cos(Math.PI/2-.02),170+15*Math.sin(Math.PI/2-.02)]];
    await page.click('#camera-open');
    for(const position of positions){await page.fill('#camera-json',JSON.stringify({...base,position,target:[0,12,170]}));await page.click('#camera-restore');assert.equal(await page.locator('#camera-message').textContent(),'Saved angle restored.');}
    await page.locator('#camera-dialog .close').click();await page.click('#reset');await settle();return positions;
  });
  await check('real canvas hover and click selects all landmark roots',async()=>{
    const ids=report.initial.landmarks.map(x=>x.id),result=[];
    for(const id of ids){
      await page.click('#reset');await page.selectOption('#building',id);await page.click('#focus');await settle();await page.click('#clear');
      const center=await page.evaluate(id=>window.__map.project(id),id);
      let found=null;
      for(const [dx,dy] of [[0,0],[0,-35],[-35,-35],[35,-35],[0,-70],[-70,0],[70,0],[0,35],[-35,35],[35,35],[-150,80],[150,80]]){
        await page.mouse.move(center.x+dx,center.y+dy);await page.waitForTimeout(30);
        if((await snapshot()).hovered===id){found={x:center.x+dx,y:center.y+dy};break;}
      }
      assert.ok(found,`No visible hit found for ${id}`);assert.ok(await page.locator('#hover').isVisible());
      await page.mouse.click(found.x,found.y);assert.equal((await snapshot()).selected,id);result.push({id,point:found});
    }
    return result;
  });
  await check('render timing sample',async()=>{
    await page.click('#reset');await settle();
    const timing=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now();function frame(now){samples.push(now-last);last=now;if(samples.length<90)requestAnimationFrame(frame);else resolve(samples.slice(1));}requestAnimationFrame(frame);}));
    timing.sort((a,b)=>a-b);const total=timing.reduce((a,b)=>a+b,0);
    return {frames:timing.length,meanFrameMs:total/timing.length,medianFrameMs:timing[Math.floor(timing.length*.5)],p95FrameMs:timing[Math.floor(timing.length*.95)],fps:1000*timing.length/total,render:(await snapshot()).render};
  });
  await check('mobile resize keeps map and camera usable',async()=>{
    await page.setViewportSize({width:390,height:844});await settle();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    const dimensions=await page.locator('#map canvas').evaluate(e=>({w:e.clientWidth,h:e.clientHeight}));assert.deepEqual(dimensions,{w:390,h:844});
    await page.screenshot({path:`${out}/04-campus-mobile.png`});
    await page.click('#camera-open');assert.ok(await page.locator('#camera-dialog').isVisible());await page.locator('#camera-dialog .close').click();
    const before=(await snapshot()).camera;await drag(310,280,360,345);assert.notDeepEqual((await snapshot()).camera,before);return dimensions;
  });
  report.final=await snapshot();
}catch(e){report.fatal=e.stack;}
await context.close();
await browser.close();
fs.writeFileSync(`${out}/baseline-browser-results.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks,errors:report.errors,fatal:report.fatal},null,2));
if(report.fatal||report.checks.some(c=>!c.pass))process.exitCode=1;
