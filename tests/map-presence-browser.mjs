import { goGreekPopup } from '../src/go-greek-popup.js';
const expectedLandmarkCount = 9 + Number(goGreekPopup.enabled);
import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';

const url=process.env.MAP_URL||'http://127.0.0.1:4187';
const out=process.env.MAP_EVIDENCE||'evidence/map-presence-ui';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={url,browser:browser.version(),checks:[],limitations:['Headless Chrome using software WebGL; mobile viewport emulated, no physical device or touch gesture measurements.','Tracked screenshots use synthetic people/initials only; live names, IDs and portraits are excluded from tracked evidence.','No cloud writes, model requests, deployment or unrelated process changes.']};
const check=async(name,fn)=>{if(process.env.MAP_SKIP_LIVE==='true'&&name.startsWith('Live database'))return;if(process.env.MAP_CHECK_PATTERN&&!new RegExp(process.env.MAP_CHECK_PATTERN).test(name))return;try{report.checks.push({name,pass:true,detail:await fn()});console.log('PASS '+name);}catch(e){report.checks.push({name,pass:false,error:e.message});console.error('FAIL '+name+' '+e.message);}};
const snap=p=>p.evaluate(()=>window.__map.snapshot());
const presence=p=>p.evaluate(()=>window.__map.presence.snapshot());
const markers=p=>p.locator('button.map-presence__person');
const settle=p=>p.waitForTimeout(1100);
async function clickMarker(page,index=0){
  const marker=markers(page).nth(index);let box=await marker.boundingBox();assert(box&&box.width>0,'Avatar must be visible for actual pointer click');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(150);box=await marker.boundingBox();
  const point={x:box.x+box.width/2,y:box.y+box.height/2},id=await marker.getAttribute('data-person-id');
  assert.equal(await page.evaluate(({x,y,id})=>document.elementFromPoint(x,y)?.closest('button.map-presence__person')?.dataset.personId===id,{...point,id}),true);
  await page.mouse.click(point.x,point.y);
}
async function fixture(payload){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(!r.url().includes('/api/'))failed.push(new URL(r.url()).pathname);});
  let current=payload;
  if(payload!==undefined)await page.route('**/api/map/presence',route=>current==='error'?route.fulfill({status:503,json:{status:'unavailable',buildings:[]}}):route.fulfill({json:current}));
  const start=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__map?.snapshot().status==='ready'&&document.querySelector('#app')?.dataset.state==='entered',null,{timeout:120000});
  await page.waitForFunction(()=>window.__map?.presence.snapshot().status!=='loading');await settle(page);
  return {context,page,errors,failed,loadMs:Date.now()-start,set:async value=>{current=value;await page.evaluate(()=>window.__map.presence.refresh());await page.waitForTimeout(150);}};
}
function synthetic(count=5,overrides={}){const now=Date.now();return {status:'ok',observedAt:new Date(now).toISOString(),buildings:[{id:'bobst-library',name:'Bobst Library',people:Array.from({length:count},(_,i)=>({id:`synthetic-${i}`,displayName:`Person ${i+1}`,avatarUrl:null,status:'planned',validFrom:new Date(now-60000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),label:'Test',...overrides}))}]};}
async function markerGeometry(page){return page.locator('.map-presence__group[data-building-id="bobst-library"]').evaluate(g=>({anchor:{x:g.getBoundingClientRect().x,y:g.getBoundingClientRect().y},buttons:[...g.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {x:r.x,y:r.y,w:r.width,h:r.height,radius:s.borderRadius,border:s.borderTopWidth};})}));}
async function aligned(page){const s=await snap(page),size=page.viewportSize(),box=s.landmarks.find(x=>x.id==='bobst-library').bounds,c=s.camera;
  const camera=new PerspectiveCamera(c.fov,size.width/size.height,c.near,c.far);camera.position.fromArray(c.position);camera.zoom=c.zoom;camera.lookAt(new Vector3(...c.target));camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const p=new Vector3((box.min[0]+box.max[0])/2,box.max[1]+2,(box.min[2]+box.max[2])/2).project(camera),expected={x:(p.x+1)*size.width/2,y:(1-p.y)*size.height/2};
  const actual=(await markerGeometry(page)).anchor,error=Math.hypot(actual.x-expected.x,actual.y-expected.y);assert(error<3,`Roof marker error ${error.toFixed(2)}px`);return {errorPx:error,anchor:actual};}
function bounds(g,size){assert.equal(g.buttons.length,5);assert.equal(new Set(g.buttons.map(b=>`${Math.round(b.x)},${Math.round(b.y)}`)).size,5);for(const b of g.buttons){assert(b.x>=0&&b.y>=0&&b.x+b.w<=size.width&&b.y+b.h<=size.height,`Marker outside viewport ${JSON.stringify(b)}`);assert(Math.abs(b.w-b.h)<.01);assert.equal(b.radius,'50%');}for(let i=0;i<g.buttons.length;i++)for(let j=i+1;j<g.buttons.length;j++){const a=g.buttons[i],b=g.buttons[j];assert(Math.hypot(a.x-b.x,a.y-b.y)>=a.w,'Avatar circles overlap');}}
let live,syntheticPage;
try{
  await check('Live database endpoint displays exactly five debug people at Bobst and loads every approved portrait',async()=>{
    live=await fixture();const p=live.page,s=await snap(p),ps=await presence(p);assert.equal(ps.status,'ok');assert.equal(ps.count,5);assert.equal(ps.buildings.length,1);assert.equal(ps.buildings[0].id,'bobst-library');assert.equal(ps.buildings[0].visible,true);
    assert.equal(await markers(p).count(),5);assert.equal(await p.locator('.map-presence__label').count(),5);
    const images=await p.locator('.map-presence__person img').evaluateAll(images=>images.map(x=>({complete:x.complete,naturalWidth:x.naturalWidth,url:x.currentSrc})));
    assert.equal(images.length,5);assert(images.every(x=>x.complete&&x.naturalWidth>0));for(const image of images){const r=await p.request.get(image.url);assert.equal(r.status(),200);assert.match(r.headers()['content-type'],/^image\/png/);}
    assert.equal(s.landmarks.length,expectedLandmarkCount);assert.deepEqual(s.failed,[]);assert.deepEqual(live.errors,[]);assert.deepEqual(live.failed,[]);assert.equal(await p.locator('body').getAttribute('class'),'map-only');assert(await p.locator('.toolbar').isHidden());assert(await p.locator('.map-presence').isVisible());
    await p.screenshot({path:'/tmp/tech-nyu-map-presence-live-private.png'});await fs.chmod('/tmp/tech-nyu-map-presence-live-private.png',0o600);return {loadMs:live.loadMs,landmarks:s.landmarks.length,people:ps.count,loadedPortraits:images.length,errors:live.errors.length,failedAssets:live.failed.length};
  });
  if(live){await live.context.close();live=null;}
  syntheticPage=await fixture(synthetic());const p=syntheticPage.page;
  await check('Circular avatar ring, spacing and roof anchors remain readable on the unchanged desktop map',async()=>{const g=await markerGeometry(p);bounds(g,p.viewportSize());const alignment=await aligned(p);await p.screenshot({path:out+'/synthetic-desktop.png'});return {...alignment,diameter:g.buttons[0].w,spacing:g.buttons[1].x-g.buttons[0].x};});
  await check('Actual pointer orbit reprojects the same roof anchor without moving map geometry',async()=>{
    const before=await snap(p),a=(await markerGeometry(p)).anchor;await p.mouse.move(1050,450);await p.mouse.down();await p.mouse.move(1150,510,{steps:12});await p.mouse.up();await settle(p);const after=await snap(p),b=(await markerGeometry(p)).anchor;assert.notDeepEqual(after.camera,before.camera);assert(Math.hypot(a.x-b.x,a.y-b.y)>10);assert.deepEqual(after.landmarks.find(x=>x.id==='bobst-library').bounds,before.landmarks.find(x=>x.id==='bobst-library').bounds);return aligned(p);
  });
  await check('Pointer avatar activation selects Bobst, runs camera focus, and exposes the table label in its tooltip',async()=>{
    const before=(await snap(p)).camera;await clickMarker(p);await settle(p);const s=await snap(p);assert.equal(s.selected,'bobst-library');assert.notDeepEqual(s.camera,before);assert(await p.locator('#map-presence-detail').isVisible());assert.match(await p.locator('#map-presence-detail').textContent(),/Person 1.*Bobst Library.*Test/s);assert.equal(await markers(p).first().getAttribute('aria-expanded'),'true');const a=await aligned(p);await p.keyboard.press('Escape');assert(await p.locator('#map-presence-detail').isHidden());return a;
  });
  await check('Keyboard avatar activation and Escape retain accessible selection',async()=>{
    await p.evaluate(()=>window.__map.reset());await settle(p);await markers(p).nth(1).focus();assert.equal(await markers(p).nth(1).evaluate(e=>e===document.activeElement),true);assert(await p.locator('#map-presence-detail').isVisible());await p.keyboard.press('Enter');await settle(p);assert.equal((await snap(p)).selected,'bobst-library');assert.match(await p.locator('#map-presence-detail').textContent(),/Person 2/);await p.keyboard.press('Escape');assert(await p.locator('#map-presence-detail').isHidden());return {keyboard:true};
  });
  await check('Unchanged poll refresh preserves keyboard focus and pinned person detail',async()=>{
    await markers(p).nth(3).focus();await p.keyboard.press('Enter');await p.evaluate(()=>window.__map.presence.refresh());
    assert.equal(await markers(p).nth(3).evaluate(e=>e===document.activeElement),true);assert.equal(await markers(p).nth(3).getAttribute('aria-expanded'),'true');assert.match(await p.locator('#map-presence-detail').textContent(),/Person 4/);await p.keyboard.press('Escape');return {focusPreserved:true};
  });
  await check('Complete building hover lift moves both roof bounds and avatar anchor together',async()=>{
    await p.evaluate(()=>window.__map.reset());await p.mouse.move(1400,30);await p.waitForFunction(()=>window.__map.snapshot().landmarks.find(x=>x.id==='bobst-library').bounds.min[1]<2.7,null,{timeout:15000});const before=await snap(p),box=before.landmarks.find(x=>x.id==='bobst-library').bounds,point=before.landmarks.find(x=>x.id==='bobst-library').screen;
    let hit=false;for(const [dx,dy]of [[0,0],[0,-35],[35,-35],[-35,-35],[0,35]]){await p.mouse.move(point.x+dx,point.y+dy);await p.waitForTimeout(50);if((await snap(p)).hovered==='bobst-library'){hit=true;break;}}
    assert(hit,'Could not hover Bobst via canvas');await p.waitForFunction(y=>window.__map.snapshot().landmarks.find(x=>x.id==='bobst-library').bounds.min[1]-y>4,box.min[1],{timeout:15000});const lifted=(await snap(p)).landmarks.find(x=>x.id==='bobst-library').bounds;assert(Math.abs((lifted.min[1]-box.min[1])-(lifted.max[1]-box.max[1]))<.001);return {...await aligned(p),lift:lifted.min[1]-box.min[1]};
  });
  await check('Mobile resize keeps all five markers distinct and selectable with no horizontal overflow',async()=>{
    await p.mouse.move(1400,30);await p.evaluate(()=>window.__map.reset());await p.setViewportSize({width:390,height:844});await settle(p);const g=await markerGeometry(p);bounds(g,p.viewportSize());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);await clickMarker(p,2);await settle(p);assert.equal((await snap(p)).selected,'bobst-library');const a=await aligned(p);await p.keyboard.press('Escape');await p.screenshot({path:out+'/synthetic-mobile.png'});await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>window.__map.reset());await settle(p);return {...a,diameter:g.buttons[0].w};
  });
  await check('Narrow viewport wraps the avatar fan; near-edge projection keeps circles inside the screen',async()=>{
    try{for(const width of [250,240]){await p.setViewportSize({width,height:720});await p.evaluate(()=>{window.__map.reset();window.__map.select('bobst-library');window.__map.focus();});await settle(p);bounds(await markerGeometry(p),p.viewportSize());await p.screenshot({path:out+`/synthetic-narrow-${width}.png`});}
    await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>window.__map.reset());await settle(p);
    const s=await snap(p),c=s.camera,box=s.landmarks.find(x=>x.id==='bobst-library').bounds,cam=new PerspectiveCamera(c.fov,1.44,c.near,c.far);cam.position.fromArray(c.position);cam.lookAt(new Vector3(...c.target));cam.updateMatrixWorld();
    const roof=new Vector3((box.min[0]+box.max[0])/2,box.max[1]+2,(box.min[2]+box.max[2])/2),depth=-roof.clone().applyMatrix4(cam.matrixWorldInverse).z,current=(await markerGeometry(p)).anchor.x;
    const right=new Vector3(1,0,0).applyQuaternion(cam.quaternion),shift=right.multiplyScalar(-(45-current)*2/1440*depth*Math.tan(c.fov*Math.PI/360)*1.44);
    await p.evaluate(value=>window.__map.restoreCamera(value),{...c,position:new Vector3(...c.position).add(shift).toArray(),target:new Vector3(...c.target).add(shift).toArray()});await settle(p);
    const g=await markerGeometry(p);assert(g.anchor.x<100&&g.anchor.x>0);bounds(g,p.viewportSize());const a=await aligned(p);await p.screenshot({path:out+'/synthetic-edge.png'});return {...a,narrowWidths:[250,240]};}finally{await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>window.__map.reset());await settle(p);}
  });
  await check('Expired and future fixtures are omitted; active markers expire without another network request',async()=>{
    let payload=synthetic(1,{expiresAt:new Date(Date.now()-1).toISOString()});await syntheticPage.set(payload);assert.equal((await presence(p)).count,0);
    payload=synthetic(1,{validFrom:new Date(Date.now()+60000).toISOString()});await syntheticPage.set(payload);assert.equal((await presence(p)).count,0);
    payload=synthetic(1,{expiresAt:new Date(Date.now()+1500).toISOString()});await syntheticPage.set(payload);assert.equal((await presence(p)).count,1);await p.waitForFunction(()=>window.__map.presence.snapshot().count===0,null,{timeout:5000});return {expiryRemoves:true};
  });
  await check('Presence failures clear stale markers, leave startup/map usable, and recover on refresh',async()=>{
    await syntheticPage.set(synthetic());assert.equal((await presence(p)).count,5);await syntheticPage.set('error');assert.equal((await presence(p)).status,'unavailable');assert.equal(await markers(p).count(),0);assert.equal((await snap(p)).status,'ready');assert(await p.locator('#startup-notice').isHidden());
    const before=(await snap(p)).camera;await p.mouse.move(1050,450);await p.mouse.wheel(0,-100);await settle(p);assert.notDeepEqual((await snap(p)).camera,before);await syntheticPage.set(synthetic());assert.equal((await presence(p)).count,5);return {recovered:true};
  });
  await check('Unknown avatar URLs remain initials and malformed payload cannot inject markup',async()=>{
    await p.evaluate(()=>{window.__map.reset();window.__map.select('bobst-library');window.__map.focus();});await settle(p);await syntheticPage.set(synthetic(1,{avatarUrl:'https://example.invalid/private.png',displayName:'<img src=x onerror=alert(1)>'}));assert.equal(await p.locator('.map-presence__person img').count(),0);await clickMarker(p);assert.match(await p.locator('#map-presence-detail strong').textContent(),/^<img/);assert.equal(await p.locator('#map-presence-detail img').count(),0);
    await syntheticPage.set({status:'ok',buildings:[{id:'bobst-library',name:'Bobst',people:[{id:'bad'}]}]});assert.equal((await presence(p)).status,'unavailable');assert.equal(await markers(p).count(),0);return {safeFallback:true};
  });
  await check('Table label text is verbatim in badge, details and accessibility without status captions',async()=>{
    await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>{window.__map.reset();window.__map.select('bobst-library');window.__map.focus();});await settle(p);
    for(const label of ['Study group · 你好 🗽', '  custom label  ', '<img src=x onerror=alert(1)>']){
      await syntheticPage.set(synthetic(1,{label,status:'self_reported'}));
      const badge=p.locator('.map-presence__label');assert.equal(await badge.textContent(),label);assert.equal(await badge.locator('img').count(),0);
      await markers(p).first().focus();const detail=p.locator('#map-presence-detail');assert.deepEqual(await detail.locator(':scope > *').allTextContents(),['Person 1','Bobst Library',label]);
      assert((await markers(p).first().getAttribute('aria-label')).endsWith(label));assert.equal(await detail.locator('img').count(),0);
    }
    await p.screenshot({path:out+'/synthetic-label-literal.png'});return {verbatim:true,htmlIsText:true,generatedCaptions:false};
  });
  await check('Blank labels hide both badge and detail context without synthesizing a caption',async()=>{
    await syntheticPage.set(synthetic(1,{label:'',status:'planned'}));assert.equal(await p.locator('.map-presence__label').count(),0);await markers(p).first().focus();
    assert.deepEqual(await p.locator('#map-presence-detail').locator(':scope > *').allTextContents(),['Person 1','Bobst Library']);
    assert.equal(await markers(p).first().getAttribute('aria-label'),'Person 1 · Bobst Library');return {badgeAbsent:true,contextAbsent:true};
  });
  await check('200-code-point labels stay within readable badge bounds with full detail text',async()=>{
    const label='🗽'.repeat(200);await syntheticPage.set(synthetic(5,{label}));await markers(p).first().focus();
    const badge=p.locator('.map-presence__label').first();assert.equal(await badge.textContent(),label);
    const desktop=await badge.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {width:r.width,height:r.height,overflow:s.overflow,textOverflow:s.textOverflow};});assert(desktop.width<=160);assert(desktop.height<=80);
    assert.equal((await p.locator('#map-presence-detail').locator(':scope > *').allTextContents()).at(-1),label);
    await p.setViewportSize({width:390,height:844});await settle(p);const box=await badge.boundingBox();assert(box&&box.width<=160);
    const boxes=await p.locator('.map-presence__label').evaluateAll(items=>items.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Long neighboring labels overlap');}assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),390);
    await p.screenshot({path:out+'/synthetic-label-long-mobile.png'});await p.setViewportSize({width:1440,height:1000});await syntheticPage.set(synthetic());return {codePoints:200,badgeDesktop:desktop,mobileNoHorizontalOverflow:true};
  });
  await check('Normal synthetic browser run has no JavaScript errors or failed map assets',async()=>{assert.deepEqual(syntheticPage.errors,[]);assert.deepEqual(syntheticPage.failed,[]);return {errors:0,failedAssets:0,loadMs:syntheticPage.loadMs};});
}catch(e){report.fatal=e.message;}finally{await live?.context.close();await syntheticPage?.context.close();await browser.close();await fs.writeFile(out+'/browser-results.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({checks:report.checks.length,passed:report.checks.filter(x=>x.pass).length,fatal:report.fatal}));
if(report.fatal||report.checks.some(x=>!x.pass))process.exitCode=1;
