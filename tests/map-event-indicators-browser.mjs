import {chromium} from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const url=process.env.MAP_URL??'http://127.0.0.1:5174',out=process.env.MAP_EVIDENCE??'evidence/map-event-indicators';
await fs.mkdir(out,{recursive:true});
const main=await fs.readFile('src/app/map-diagnostics.js','utf8'),lineNumber=main.split('\n').findIndex(l=>l.includes("Object.defineProperty(window, '__map'"));
const base=Date.parse('2026-11-01T12:00:00Z'),iso=n=>new Date(n).toISOString();
const event=(id,patch={})=>({id,title:'Synthetic scheduled event',kind:'scheduled_event',status:'confirmed',startsAt:iso(base-1000),endsAt:iso(base+90000),allDay:false,timeZone:'America/New_York',location:'Synthetic room',attendees:[],...patch});
const report={url,checks:[],limitations:['Synthetic intercepted API only; no real provider reads, model calls or stored events.','Isolated installed headless Chrome; mobile viewport and reduced motion emulated, no physical touch/GPU timing claim.','Clock is fixed and advanced in this browser context, independent of real polling intervals.']};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});report.chrome=browser.version();
async function fixture({retiredData=false,reducedMotion='no-preference',viewport={width:1440,height:1000}}={}) {
  const context=await browser.newContext({viewport,reducedMotion}),page=await context.newPage(),errors=[],failures=[],requests=[];let phase='normal',apiCalls=0;
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('requestfailed',r=>failures.push(r.url()));
  await page.addInitScript(base=>{globalThis.__eventTestClock=base;Date.now=()=>globalThis.__eventTestClock;},base);
  await page.route('**/api/**',async route=>{
    if(new URL(route.request().url()).pathname!=='/api/map/presence')return route.fulfill({json:{chat:{configured:false},access:{allowed:false}}});
    apiCalls++;if(phase==='failure')return route.fulfill({status:503,json:{status:'unavailable',buildings:[]}});
    const silverEvents=phase==='kind-change'?[event('silver-a',{kind:'presence'})]:[event('silver-a'),event('silver-overlap',{endsAt:iso(base+100000)})];
    return route.fulfill({json:{status:'ok',observedAt:iso(base),upcoming:[],buildings:[
      {id:'nyu-silver-center',name:'Silver Center',people:[],events:silverEvents},
      ...(retiredData?[{id:'683-broadway',name:'Retired popup fixture',people:[],events:[event('retired-popup')]}]:[]),
      {id:'bobst-library',name:'Bobst Library',people:[],events:[event('bobst',{endsAt:iso(base+120000)})]},
      {id:'courant-institute',name:'Courant',people:[],events:[event('courant-future',{startsAt:iso(base+60000),endsAt:iso(base+120000)})]},
      {id:'stern-school-of-business',name:'Stern',people:[],events:[event('all-day',{allDay:true,startsAt:'2026-11-01T04:00:00Z',endsAt:'2026-11-02T05:00:00Z'})]},
      {id:'nyu-kimmel-center',name:'Kimmel',people:[],events:[event('personal',{kind:'personal_plan'}),event('tentative',{status:'tentative'}),event('missing-kind',{kind:undefined})]},
    ]}});
  });
  const debug=await context.newCDPSession(page);await debug.send('Debugger.enable');await debug.send('Debugger.setBreakpointByUrl',{urlRegex:'/src/app/map-diagnostics\\.js(?:\\?|$)',lineNumber});let captured=false;
  debug.on('Debugger.paused',async e=>{try{const value=await debug.send('Debugger.evaluateOnCallFrame',{callFrameId:e.callFrames[0].callFrameId,expression:'globalThis.__eventProbe={...view,THREE,sourceDisposals:0}; for(const root of view.roots.values())root.traverse(m=>{if(m.isMesh){m.geometry.addEventListener("dispose",()=>__eventProbe.sourceDisposals++);m.material.addEventListener("dispose",()=>__eventProbe.sourceDisposals++);}}); true',returnByValue:true});assert(!value.exceptionDetails);captured=true;}finally{await debug.send('Debugger.resume');}});
  const started=Date.now();await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__map?.snapshot().status==='ready'&&document.querySelector('#app').dataset.state==='entered',null,{timeout:120000});assert(captured);await debug.send('Debugger.disable');
  if(await page.getByRole('button',{name:'Close assistant',exact:true}).isVisible())await page.getByRole('button',{name:'Close assistant',exact:true}).click();
  await page.mouse.move(5,5);await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok');
  return {context,page,errors,failures,requests,loadMs:Date.now()-started,phase:v=>{phase=v;},calls:()=>apiCalls,snap:()=>page.evaluate(()=>window.__map.eventIndicators.snapshot()),refresh:()=>page.evaluate(()=>window.__map.presence.refresh())};
}
async function inspect(page) {
  return page.evaluate(async()=>{
    const q=window.__eventProbe,root=q.roots.get('nyu-silver-center');q.scene.updateMatrixWorld(true);const geometry=[];
    if(root)for(const m of [root,...root.children].filter(m=>m.isMesh)){
      const a=m.geometry.attributes.position,array=a.isInterleavedBufferAttribute?a.data.array:a.array;
      const hash=await crypto.subtle.digest('SHA-256',array.buffer.slice(array.byteOffset,array.byteOffset+array.byteLength));
      geometry.push({geometry:m.geometry.uuid,material:m.material.uuid,hash:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),matrix:m.matrixWorld.toArray(),color:m.material.color.getHexString()});
    }
    const decorations=q.scene.children.filter(n=>n.name.startsWith('Active event '));
    return {geometry,sourceDisposals:q.sourceDisposals,effects:q.landmarkEffects.snapshot(),decorations:decorations.map(n=>({name:n.name,children:n.children.map(m=>({name:m.name,sprite:m.isSprite??false,geometry:m.geometry?.uuid,material:m.material.uuid,color:m.material.color.getHexString(),depthTest:m.material.depthTest,depthWrite:m.material.depthWrite,opacity:m.material.opacity,renderOrder:m.renderOrder,pickable:q.pickMeshes.includes(m)}))}))};
  });
}
async function hit(page,id) {
  const point=await page.evaluate(id=>{const q=window.__eventProbe,root=q.roots.get(id),b=new q.THREE.Box3().setFromObject(root),ray=new q.THREE.Raycaster();q.camera.updateMatrixWorld(true);q.scene.updateMatrixWorld(true);
    for(const fx of [.25,.5,.75])for(const fy of [.4,.7,.95])for(const fz of [.25,.5,.75]){const v=new q.THREE.Vector3(b.min.x+(b.max.x-b.min.x)*fx,b.min.y+(b.max.y-b.min.y)*fy,b.min.z+(b.max.z-b.min.z)*fz).project(q.camera);if(Math.abs(v.x)>.95||Math.abs(v.y)>.95)continue;ray.setFromCamera(new q.THREE.Vector2(v.x,v.y),q.camera);let n=ray.intersectObjects(q.pickMeshes,false)[0]?.object;while(n&&!n.userData.buildingId)n=n.parent;if(n?.userData.buildingId===id)return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};}return null;},id);
  assert(point,`No visible actual source hit for ${id}`);return point;
}
async function check(name,fn) {try{const data=await fn();report.checks.push({name,pass:true,data});console.log('PASS '+name);}catch(e){report.checks.push({name,pass:false,error:e.stack});console.log('FAIL '+name+': '+e.message);}}
let f;
try {
  f=await fixture();const {page}=f;const initialGeometry=(await inspect(page)).geometry;
  await check('Desktop complete map independently indicates every active scheduled building, with no people and one marker per overlap',async()=>{
    const readOnly=await page.evaluate(()=>({keys:Object.keys(window.__map.eventIndicators),frozen:Object.isFrozen(window.__map.eventIndicators)}));assert.deepEqual(readOnly.keys,['snapshot']);assert.equal(readOnly.frozen,true);
    const s=await f.snap();assert.deepEqual(s.activeBuildingIds,['bobst-library','nyu-silver-center','stern-school-of-business']);assert.equal(s.resources.markers,3);assert.equal(s.resources.textures,1);assert.equal(s.resources.materials,2);
    const map=await page.evaluate(()=>window.__map.snapshot());assert.equal(map.landmarks.length,9);assert.deepEqual(map.failed,[]);
    const root=map.landmarks.find(l=>l.id==='nyu-silver-center'),marker=s.markers.find(m=>m.buildingId==='nyu-silver-center');assert.deepEqual(marker.bounds,root.bounds);assert(marker.bounds.max[1]>marker.bounds.min[1]);assert(marker.position[1]-marker.scale[1]/2>=root.bounds.max[1]+1.99);
    const details=await inspect(page);for(const d of details.decorations){assert(d.children.every(m=>!m.pickable));assert.equal(d.children.filter(m=>m.sprite).length,1);assert(d.children.filter(m=>!m.sprite).every(m=>m.color==='f2c94c'&&m.renderOrder===3));}return {snapshot:s,loadMs:f.loadMs};
  });
  await check('Marker canvas pixels and sprite render style match the exact reference artwork',async()=>{
    const data=await page.evaluate(()=>{const q=window.__eventProbe,n=q.scene.children.find(n=>n.name==='Active event nyu-silver-center'),sprite=n.children.find(m=>m.isSprite),actual=sprite.material.map.image,expected=document.createElement('canvas');expected.width=256;expected.height=320;const c=expected.getContext('2d');c.shadowColor='rgba(242, 201, 76, 0.92)';c.shadowBlur=30;c.fillStyle='#f2c94c';c.fillRect(104,47,48,170);c.strokeStyle='#17140f';c.lineWidth=8;c.strokeRect(104,47,48,170);c.beginPath();c.arc(128,263,24,0,Math.PI*2);c.fill();c.stroke();const a=actual.getContext('2d').getImageData(0,0,256,320).data,b=c.getImageData(0,0,256,320).data;let differences=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])differences++;return {differences,width:actual.width,height:actual.height,colorSpace:sprite.material.map.colorSpace,transparent:sprite.material.transparent,depthTest:sprite.material.depthTest,depthWrite:sprite.material.depthWrite,toneMapped:sprite.material.toneMapped,renderOrder:sprite.renderOrder};});
    assert.equal(data.differences,0);assert.equal(data.width,256);assert.equal(data.height,320);assert.equal(data.colorSpace,'srgb');assert.equal(data.depthTest,false);assert.equal(data.depthWrite,false);assert.equal(data.toneMapped,false);assert.equal(data.renderOrder,21);return data;
  });
  await page.screenshot({path:`${out}/desktop-overview.png`});
  await check('Actual canvas hover and click retain independent gold markers/glow alongside white complete-model selection, ring and outline',async()=>{
    const point=await hit(page,'nyu-silver-center');await page.mouse.move(point.x,point.y);await page.waitForTimeout(500);assert.equal((await page.evaluate(()=>window.__map.snapshot())).hovered,'nyu-silver-center');
    await page.mouse.click(point.x,point.y);await page.mouse.move(5,5);await page.waitForTimeout(1900);
    const state=await page.evaluate(()=>window.__map.snapshot()),details=await inspect(page);assert.equal(state.selected,'nyu-silver-center');assert.equal(details.effects.activeId,'nyu-silver-center');assert.equal(details.effects.ringMeshes,2);assert(details.effects.outline.proxyCount>0);assert.equal((await f.snap()).resources.markers,3);
    assert.deepEqual(details.geometry,initialGeometry);assert.equal(details.sourceDisposals,0);assert.equal(await page.locator('.map-presence__building-card h2').textContent(),'Silver Center');return {point,effects:details.effects};
  });
  await page.screenshot({path:`${out}/desktop-silver-selected.png`});
  await page.evaluate(()=>{window.__map.reset();window.__map.select('bobst-library');window.__map.focus();});await page.waitForTimeout(1900);await page.screenshot({path:`${out}/desktop-bobst-selected.png`});
  await check('Kind-only API refresh removes ineligible marker while preserving other active buildings',async()=>{f.phase('kind-change');await f.refresh();assert.deepEqual((await f.snap()).activeBuildingIds,['bobst-library','stern-school-of-business']);f.phase('normal');await f.refresh();assert.equal((await f.snap()).resources.markers,3);return await f.snap();});
  await check('Start/end boundaries reconcile without polling, including future activation and exact expiry',async()=>{
    const calls=f.calls();await page.evaluate(n=>globalThis.__eventTestClock=n,base+100000);await page.waitForTimeout(300);let s=await f.snap();assert.deepEqual(s.activeBuildingIds,['bobst-library','courant-institute','stern-school-of-business']);assert.equal(f.calls(),calls);
    await page.evaluate(n=>globalThis.__eventTestClock=n,base+120000);await page.waitForTimeout(300);s=await f.snap();assert.deepEqual(s.activeBuildingIds,['stern-school-of-business']);assert.equal(f.calls(),calls);return s;
  });
  await check('Unavailable API clears all yellow decorations and a successful recovery restores them without source mutations',async()=>{
    f.phase('failure');await f.refresh();assert.equal((await f.snap()).resources.markers,0);assert.equal((await inspect(page)).decorations.length,0);
    await page.evaluate(n=>globalThis.__eventTestClock=n,base);f.phase('normal');await f.refresh();const s=await f.snap();assert.equal(s.resources.markers,3);const details=await inspect(page);assert.deepEqual(details.geometry,initialGeometry);assert.equal(details.sourceDisposals,0);return s;
  });
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>Math.abs(window.__eventProbe.camera.aspect-390/844)<.0001);await page.evaluate(()=>{window.__map.reset();window.__map.select('nyu-silver-center');window.__map.focus();});await page.waitForTimeout(1900);
  await check('Mobile active marker remains above the complete focused rooftop and within the viewport',async()=>{const s=await f.snap(),m=s.markers.find(m=>m.buildingId==='nyu-silver-center');assert(m.visible);const projected=await page.evaluate(position=>new window.__eventProbe.THREE.Vector3().fromArray(position).project(window.__eventProbe.camera).toArray(),m.position);assert(projected.every(n=>Math.abs(n)<1));assert.equal(s.resources.markers,3);return{marker:m,projected};});
  await page.screenshot({path:`${out}/mobile-silver-selected.png`});assert.deepEqual(f.errors,[]);assert.deepEqual(f.failures,[]);await f.context.close();f=null;
  await check('Reduced motion preserves a steady indicator with no bob/pulse',async()=>{const reduced=await fixture({reducedMotion:'reduce',viewport:{width:390,height:844}});try{const before=await reduced.snap();await reduced.page.waitForTimeout(500);const after=await reduced.snap();assert.equal(after.reducedMotion,true);assert.deepEqual(after.markers,before.markers);await reduced.page.screenshot({path:`${out}/mobile-reduced-motion.png`});assert.deepEqual(reduced.errors,[]);return after;}finally{await reduced.context.close();}});
  await check('Retired popup API data cannot register a marker, selector, camera preset or model request',async()=>{
    const retired=await fixture({retiredData:true});try{
      const s=await retired.snap(),state=await retired.page.evaluate(async()=>{
        const {buildings}=await import('/src/map/data/config.js'),{buildingViews}=await import('/src/map/data/building-views.js');
        return {ids:buildings.map(b=>b.id),preset:buildingViews['683-broadway']??null,roots:[...window.__eventProbe.roots.keys()]};
      });
      assert.equal(state.ids.length,9);assert(!state.ids.includes('683-broadway'));assert(!state.roots.includes('683-broadway'));assert.equal(state.preset,null);
      assert.equal(await retired.page.locator('option[value="683-broadway"]').count(),0);
      assert(!s.markers.some(m=>m.buildingId==='683-broadway'));assert.equal(s.resources.markers,3);
      assert(!retired.requests.some(u=>/\/src\/(?:broadway-683|go-greek-popup)\.js(?:\?|$)/.test(u)));
      assert.deepEqual(retired.errors,[]);return {state,snapshot:s};
    }finally{await retired.context.close();}
  });
}catch(e){report.failure=e.stack;throw e;}
finally{if(f)await f.context.close();await fs.writeFile(`${out}/browser-results.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
assert(report.checks.every(c=>c.pass),'Browser acceptance failed; inspect browser-results.json');
