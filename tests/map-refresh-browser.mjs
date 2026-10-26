const expectedLandmarkCount = 9;
// Independent actual-campus Chrome acceptance with synthetic local APIs only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer as httpServer} from 'node:http';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';

const out=new URL('../evidence/production-map-refresh/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const vite=await createServer({configFile:false,cacheDir:'node_modules/.vite/map-refresh-browser',server:{host:'127.0.0.1',port:0},logLevel:'error'});
await vite.listen();
const assetBase=`http://127.0.0.1:${vite.httpServer.address().port}`;
const report={mode:'Actual campus/assistant in local Chrome; native synthetic NDJSON HTTP and map API',checks:[],limitations:['Software WebGL in headless desktop Chrome; no physical mobile device or live deployment verification.','Visibility lifecycle is exercised using a controlled document.visibilityState getter and real visibilitychange events.','Synthetic people only; no real source/model requests or hosted writes.']};
let current,mode='ok',delayNext=false,releaseStale,stream;
const reads=[];
const now=Date.now();
const iso=ms=>new Date(ms).toISOString();
const person=(id,label='Studying together')=>({id:`synthetic-${id}`,displayName:`Fixture ${id}`,avatarUrl:null,status:'planned',label,validFrom:iso(now-60000),expiresAt:iso(now+3600000)});
const event=(id,people=[],future=false)=>({id:`synthetic-event-${id}`,title:future?'Future fixture workshop':'Current fixture study',startsAt:iso(now+(future?3600000:-60000)),endsAt:iso(now+(future?7200000:3600000)),timeZone:'America/New_York',allDay:false,status:'confirmed',location:'Bobst Library · Room 101',attendees:people});
const payload=(people=[],events=[])=>({status:'ok',observedAt:iso(Date.now()),upcoming:[],buildings:[{id:'bobst-library',name:'Bobst Library',people,events}]});
current=payload();
const api=httpServer(async(req,res)=>{
  const path=new URL(req.url,'http://fixture.invalid').pathname;
  if(path==='/api/map/presence'){
    const index=reads.push({at:Date.now(),mode,cache:req.headers['cache-control']??null});
    let body=current,status=mode==='ok'?200:Number(mode);
    if(delayNext){delayNext=false;await new Promise(resolve=>{releaseStale=resolve;});}
    if(res.destroyed)return;
    res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(status===200?body:{status:'unavailable',buildings:[]}));return;
  }
  if(path==='/api/status'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({chat:{configured:true},access:{allowed:true}}));return;}
  if(path==='/api/chat'){
    for await(const _ of req){}
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});res.flushHeaders();
    stream={send:event=>res.write(JSON.stringify(event)+'\n'),finish:()=>{res.end(JSON.stringify({type:'done'})+'\n');stream=null;}};return;
  }
  if(path.startsWith('/api/')){res.writeHead(404);res.end();return;}
  try {const response=await fetch(assetBase+req.url);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch {res.writeHead(502);res.end();}
});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${api.address().port}`;
let browser,page;
const check=async(name,fn)=>{try{const detail=await fn();report.checks.push({name,pass:true,detail});console.log('PASS '+name);}catch(error){report.checks.push({name,pass:false,error:error.stack});console.error('FAIL '+name+' '+error.message);throw error;}};
const snapshot=()=>page.evaluate(()=>window.__map.snapshot());
const presence=()=>page.evaluate(()=>window.__map.presence.snapshot());
const people=()=>page.locator('.map-presence__person');
const fresh=async()=>{await page.evaluate(()=>window.__map.presence.refresh());};
const notify=async(count=1)=>page.evaluate(n=>{for(let i=0;i<n;i++)document.dispatchEvent(new CustomEvent('campus-map-updated'));},count);
const cameraEqual=(before,after)=>{for(const key of ['position','target'])before[key].forEach((n,i)=>assert(Math.abs(n-after[key][i])<.005,`${key}[${i}] changed during map refresh`));};
async function begin(name){
  stream=null;
  await page.getByRole('button',{name:'Open campus assistant'}).click();
  await page.locator('#campus-assistant-message').fill('Apply the synthetic map change.');
  await page.getByRole('button',{name:'Send message'}).click();
  await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Assistant is responding…');
  for(let i=0;i<100&&!stream;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert(stream,'Synthetic HTTP stream must be open');
  stream.send({type:'tool',id:'tool-1',name,status:'running'});
  await page.locator('.assistant-tool[data-status="running"]').waitFor();
}
async function finish(){stream.send({type:'delta',text:'The synthetic activity is saved.'});stream.finish();await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply complete.');await page.getByRole('button',{name:'Close assistant'}).click();await page.locator('dialog.assistant-panel').waitFor({state:'hidden'});}
try {
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  report.browser=browser.version();
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
  const errors=[],assets=[];page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',request=>{if(!request.url().includes('/api/'))assets.push(new URL(request.url()).pathname);});
  await page.addInitScript(()=>{
    window.fixtureHidden=false;window.fixturePollsEnabled=true;
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.fixtureHidden?'hidden':'visible'});
    // Retry assertions measure retry requests, independently of ordinary polling.
    const nativeInterval=window.setInterval.bind(window);
    window.setInterval=(callback,delay,...args)=>nativeInterval(delay===30000?()=>{if(window.fixturePollsEnabled)callback(...args);}:callback,delay,...args);
  });
  await check('Campus loads configured landmarks with empty authorized activity and no failed assets',async()=>{
    const started=Date.now();await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__map?.snapshot().status==='ready'&&document.querySelector('#app').dataset.state==='entered',null,{timeout:120000});
    await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok');assert.equal((await snapshot()).landmarks.length,expectedLandmarkCount);assert.equal(await people().count(),0);assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);return {loadMs:Date.now()-started,landmarks:expectedLandmarkCount};
  });
  await check('Building pointer selection and camera focus preserve complete model bounds',async()=>{
    const before=await snapshot(),point=before.landmarks.find(x=>x.id==='bobst-library').screen;
    await page.mouse.dblclick(point.x,point.y);await page.waitForTimeout(2400);
    let state=await snapshot();
    // Selection uses the native canvas pointer path; explicit focus supports browsers that treat double-click as two selects.
    assert.equal(state.selected,'bobst-library');if(state.mode!=='focused'){await page.evaluate(()=>window.__map.focus());await page.waitForTimeout(2400);state=await snapshot();}
    assert.notDeepEqual(state.camera,before.camera);assert.deepEqual(state.landmarks.map(x=>[x.id,x.bounds]),before.landmarks.map(x=>[x.id,x.bounds]));
    assert(await page.locator('.map-presence__building-card').isVisible());return {selected:state.selected,cameraChanged:true,modelBoundsUnchanged:true};
  });
  await check('Completed upsert refreshes a current avatar before the answer finishes without reload or camera reset',async()=>{
    const before=await snapshot(),n=reads.length;await begin('upsert_map_event');await page.waitForTimeout(250);assert.equal(reads.length,n,'Running tool must not trigger a read');
    const p=person('Alpha');current=payload([p],[event('current',[p])]);stream.send({type:'tool',id:'tool-1',name:'upsert_map_event',status:'completed'});
    await page.waitForFunction(()=>window.__map.presence.snapshot().count===1);assert.equal(reads.length,n+1);assert.equal(await page.getByRole('button',{name:'Stop generating'}).count(),1);assert.equal(await page.locator('.assistant-announcement').textContent(),'Assistant is responding…');
    await page.getByRole('button',{name:'Close assistant'}).click();await page.locator('dialog.assistant-panel').waitFor({state:'hidden'});await page.waitForTimeout(700);
    assert.equal(await people().first().isVisible(),true);assert.match(await page.locator('.map-presence__building-card').innerText(),/Current fixture study/);cameraEqual(before.camera,(await snapshot()).camera);assert.equal((await snapshot()).selected,'bobst-library');
    await page.screenshot({path:new URL('avatar-before-answer.png',out).pathname});
    stream.send({type:'delta',text:'The synthetic activity is saved.'});stream.finish();await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply complete.');return {readsAdded:1,avatarVisibleBeforeDone:true,selectionPreserved:true};
  });
  await check('Attendance completion refreshes while minimized; future event attendees stay off current map',async()=>{
    const n=reads.length;await begin('upsert_map_event');await page.getByRole('button',{name:'Close assistant'}).click();await page.locator('dialog.assistant-panel').waitFor({state:'hidden'});
    const active=person('Alpha'),future=person('Future');future.validFrom=iso(now+3600000);future.expiresAt=iso(now+7200000);current=payload([active,future],[event('current',[active]),event('future',[future],true)]);
    stream.send({type:'tool',id:'tool-1',name:'upsert_map_event',status:'completed'});await page.waitForFunction(()=>document.querySelectorAll('.map-presence__event-avatar').length===2);
    assert.equal(reads.length,n+1);assert.equal(await people().count(),1);assert.equal(await page.locator('.map-presence__event-avatar[aria-label="Fixture Future"]').count(),1);assert.equal(await page.locator('.assistant-announcement').textContent(),'Assistant is responding…');
    await page.screenshot({path:new URL('future-attendance-no-current-avatar.png',out).pathname});stream.finish();await page.waitForFunction(()=>document.querySelector('.assistant-announcement').textContent==='Reply complete.');return {freshCardAttendees:2,currentAvatars:1,hiddenChatCompletion:true};
  });
  await check('A delayed stale poll and repeated notifications coalesce into one post-save read',async()=>{
    const before=await snapshot();delayNext=true;releaseStale=null;const n=reads.length;await page.evaluate(()=>{void window.__map.presence.refresh();});
    await page.waitForTimeout(150);assert(releaseStale);assert.equal(reads.length,n+1);
    const a=person('Alpha'),b=person('Beta');current=payload([a,b],[event('current',[a,b])]);await notify(12);assert.equal(reads.length,n+1);
    releaseStale();await page.waitForFunction(()=>window.__map.presence.snapshot().count===2);await page.waitForTimeout(400);assert.equal(reads.length,n+2);cameraEqual(before.camera,(await snapshot()).camera);assert.equal((await snapshot()).selected,'bobst-library');await page.screenshot({path:new URL('coalesced-fresh-avatars.png',out).pathname});return {notifications:12,staleRead:1,postSaveRead:1,cameraUnchanged:true};
  });
  await check('Transient 503 clears stale people and unavailable card then recovers automatically after 1s and 3s retries',async()=>{
    const n=reads.length;mode='503';await fresh();assert.equal((await presence()).status,'unavailable');assert.equal(await people().count(),0);assert.match(await page.locator('.map-presence__building-card').innerText(),/Events are unavailable right now/);
    await page.screenshot({path:new URL('transient-unavailable.png',out).pathname});
    await page.waitForFunction(()=>window.__map.presence.snapshot().status==='unavailable');
    while(reads.length<n+2)await new Promise(resolve=>setTimeout(resolve,30));mode='ok';
    await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok',null,{timeout:6000});assert.equal(reads.length,n+3);const gaps=reads.slice(n).map((x,i,arr)=>i?x.at-arr[i-1].at:0).slice(1);assert(gaps[0]>=850&&gaps[0]<2000);assert(gaps[1]>=2800&&gaps[1]<4200);assert.equal(await people().count(),2);assert.doesNotMatch(await page.locator('.map-presence__building-card').innerText(),/unavailable/);await page.screenshot({path:new URL('automatic-recovery.png',out).pathname});return {attempts:3,retryGapsMs:gaps,stalePeopleCleared:true,recoveredWithoutUserAction:true};
  });
  await check('Transient retries stop after two attempts and authorization denial does not retry',async()=>{
    await page.evaluate(()=>{window.fixturePollsEnabled=false;});
    mode='503';const n=reads.length;await fresh();await page.waitForTimeout(4600);assert.equal(reads.length,n+3);await page.waitForTimeout(3500);assert.equal(reads.length,n+3,'Transient retry budget exhausted');
    mode='403';const forbidden=reads.length;await fresh();await page.waitForTimeout(4400);assert.equal(reads.length,forbidden+1);assert.equal((await presence()).status,'unavailable');mode='ok';await fresh();await page.evaluate(()=>{window.fixturePollsEnabled=true;});return {maxAttempts:3,forbiddenAttempts:1};
  });
  await check('Hidden page defers write refresh and recovers on foreground visibility change',async()=>{
    await page.evaluate(()=>{window.fixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'));});const n=reads.length;await notify(8);await page.waitForTimeout(1300);assert.equal(reads.length,n);
    await page.evaluate(()=>{window.fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok');await page.waitForTimeout(200);assert.equal(reads.length,n+1);return {hiddenNotifications:8,hiddenReads:0,foregroundReads:1};
  });
  await check('Map remains aligned and interactive after refresh; overview/orbit changes camera without shifting models',async()=>{
    const before=await snapshot();await page.evaluate(()=>window.__map.reset());await page.waitForTimeout(2200);const overview=await snapshot();assert.notDeepEqual(overview.camera,before.camera);
    await page.mouse.move(1060,440);await page.mouse.down();await page.mouse.move(1150,500,{steps:10});await page.mouse.up();await page.waitForTimeout(800);const after=await snapshot();assert.notDeepEqual(after.camera,overview.camera);assert.deepEqual(after.landmarks.map(x=>[x.id,x.bounds]),before.landmarks.map(x=>[x.id,x.bounds]));assert.equal(await people().count(),2);assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);await page.screenshot({path:new URL('overview-after-refresh.png',out).pathname});return {modelBoundsUnchanged:true,orbitUsable:true,pageErrors:0,failedAssets:0};
  });
  await check('Disposal aborts pending work, removes overlay and cancels queued retries/listeners',async()=>{
    await page.route('**/__dispose_fixture',route=>route.fulfill({contentType:'text/html',body:`<html><body><div id="app" data-state="entered" style="width:1000px;height:800px"></div><script type="module">import{createMapPresence}from'/src/map-presence.js';import{PerspectiveCamera}from'/node_modules/three/build/three.module.js';window.fixtureReads=0;window.presence=createMapPresence({container:document.querySelector('#app'),camera:new PerspectiveCamera(),renderer:{},getRoot:()=>null,selectBuilding(){},focusBuilding(){},fetchImpl:async(_url,{signal})=>{window.fixtureReads++;if(window.fixtureReads===1)return new Response('{}',{status:503});return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{window.aborted=true;reject(new DOMException('Aborted','AbortError'));},{once:true}));}});</script></body></html>`}));
    await page.goto(base+'/__dispose_fixture');await page.waitForFunction(()=>window.fixtureReads===1);await page.evaluate(()=>window.presence.dispose());await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>window.fixtureReads),1);assert.equal(await page.locator('.map-presence').count(),0);
    await page.reload();await page.waitForFunction(()=>window.fixtureReads===2);await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('campus-map-updated'));window.presence.dispose();document.dispatchEvent(new CustomEvent('campus-map-updated'));window.dispatchEvent(new Event('focus'));});await page.waitForTimeout(1300);assert.equal(await page.evaluate(()=>window.aborted),true);assert.equal(await page.evaluate(()=>window.fixtureReads),2);assert.equal(await page.locator('.map-presence').count(),0);return {retryCancelled:true,pendingAborted:true,detachedNotificationsIgnored:true};
  });
}catch(error){report.fatal=error.stack;process.exitCode=1;}
finally{releaseStale?.();stream?.finish();await browser?.close();api.closeAllConnections();await new Promise(resolve=>api.close(resolve));await vite.close();report.reads=reads.map((x,i)=>({attempt:i+1,...x}));await fs.writeFile(new URL('browser-results.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.checks.filter(x=>x.pass).length,total:report.checks.length,fatal:report.fatal}));}
