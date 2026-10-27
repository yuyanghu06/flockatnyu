import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {serve} from '@hono/node-server';
import {chromium} from 'playwright-core';
import {createApp} from '../server/runtime/app.js';
import {createWebsite} from '../server/web.js';
import {readConfig} from '../server/shared/config.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/auth/site-auth.js';
import {createMapAvatarService} from '../server/map/avatars.js';
import {createMapPresenceService} from '../server/map/presence.js';

const out='evidence/storage-avatars';await mkdir(out,{recursive:true});
const base='https://synthetic.supabase.co',sid=randomUUID(),eid=randomUUID(),pid=randomUUID();
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XsAAAAASUVORK5CYII=','base64'));
const hash=createHash('sha256').update(png).digest('hex'),storageUrl=`${base}/storage/v1/object/authenticated/map-avatars/${pid}/${hash}.png`;
const proxy=`/api/map/people/${pid}/avatar`,started=Date.now(),at=new Date(started).toISOString();
process.env.SUPABASE_URL=base;
const data={event_types:['study','meeting','event','social','other'].map((code,index)=>({code,name:code,description:'',icon_key:code,sort_order:index})),buildings:[{id:'bobst-library',name:'Bobst Library'}],people:[],events:[],event_buildings:[],event_people:[]};
const upstream=[];let failedPersonId=null;
const avatar=createMapAvatarService({env:{SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'synthetic-browser-key'},fetchImpl:async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,base);assert.equal(options.redirect,'error');upstream.push(u.pathname);
  await new Promise(resolve=>setTimeout(resolve,30));
  if(u.pathname==='/rest/v1/map_people')return Response.json(data.people.filter(person=>'eq.'+person.id===u.searchParams.get('id')));
  assert(data.people.some(person=>person.avatar_url===url));return failedPersonId&&u.pathname.includes('/'+failedPersonId+'/')?new Response(null,{status:404}):new Response(png,{headers:{'content-type':'image/png'}});
}});
const presence=createMapPresenceService({store:{configured:true,read:async()=>data},production:true,authorizeSource:async()=>true});
const config=readConfig({NODE_ENV:'production',ASSISTANT_ALLOWED_SOURCE_IDS:sid});
const authEnv={PUBLIC_ORIGIN:'https://synthetic.example',SITE_ACCESS_PASSWORD:'synthetic-browser-password',SITE_SESSION_SECRET:'synthetic-browser-signing-secret-12345'};
const siteAuth=createSiteAuth({config:readSiteAuthConfig(authEnv),apiConfig:config});
const cookie=siteAuth.issue(authEnv.SITE_ACCESS_PASSWORD).split(';')[0];
const website=createWebsite({siteAuth,apiApp:createApp({config,auth:siteAuth.auth,mapPresenceService:presence,mapAvatarService:avatar})});
const server=serve({fetch:website.fetch,hostname:'127.0.0.1',port:0});
await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const indexHash=()=>readFile(new URL('../dist/index.html',import.meta.url)).then(bytes=>createHash('sha256').update(bytes).digest('hex'));
const beforeHash=await indexHash(),checks=[],observations=[],errors=[],foreign=[],requests=[];
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{cookie}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.origin!==url)foreign.push(u.origin);if(u.pathname.includes('/avatar'))requests.push(u.pathname);});
const check=async(name,work)=>{try{const detail=await work();checks.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){checks.push({name,pass:false,error:e.message});throw e;}};
const refresh=async()=>{await page.evaluate(()=>window.__map.presence.refresh());await page.waitForTimeout(150);};
const loaded=selector=>page.waitForFunction(selector=>[...document.querySelectorAll(selector)].length>0&&[...document.querySelectorAll(selector)].every(img=>img.complete&&img.naturalWidth>0),selector,{timeout:10000});
let fatal;
try {
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__map?.snapshot().status==='ready'&&document.querySelector('#app')?.dataset.state==='entered',null,{timeout:120000});
  await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok');
  await check('Built map starts with no dynamic profile or avatar requests',async()=>{assert.equal(await page.locator('.map-presence__person').count(),0);assert.equal(upstream.length,0);return {bundleHash:beforeHash,landmarks:(await page.evaluate(()=>window.__map.snapshot())).landmarks.length};});
  // This UUID/profile/object does not exist until AFTER the production bundle
  // has loaded. It is kept entirely in these synthetic in-memory stores.
  data.people.push({id:pid,display_name:'Synthetic New Person',is_trackable:true,avatar_url:storageUrl});
  data.events.push({id:eid,name:'Synthetic storage session',notes:'',kind:'personal_plan',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:new Date(started-60000).toISOString(),ends_at:new Date(started+3600000).toISOString(),time_zone:'America/New_York',source_id:sid,source_url:'https://discord.com/channels/100/200/300',source_record_id:'300',reported_at:at});
  data.event_buildings.push({event_id:eid,building_id:'bobst-library',location_notes:''});
  data.event_people.push({event_id:eid,person_id:pid,attendance_status:'going',presence_basis:'planned',label:'',source_id:sid,source_url:'https://discord.com/channels/100/200/300',reported_at:at});
  await check('Post-build profile appears on refresh and loads exact private proxy PNG',async()=>{
    await refresh();await loaded('.map-presence__person img');
    const img=page.locator('.map-presence__person img');assert.equal(await img.count(),1);assert.equal(await img.getAttribute('src'),proxy);
    const response=await context.request.get(url+proxy);assert.equal(response.status(),200);assert.deepEqual(new Uint8Array(await response.body()),png);assert.equal(response.headers()['cache-control'],'no-store');
    assert(upstream.some(path=>path.includes('/storage/v1/object/authenticated/')));assert.equal(await indexHash(),beforeHash);
    await page.screenshot({path:out+'/dynamic-overview.png'});return {newPersonId:pid,imageWidth:await img.evaluate(e=>e.naturalWidth),noRebuild:true};
  });
  // Overview packing has no visible candidate in this software-WebGL fixture.
  // Record that limitation instead of treating a hidden zero-size button as a
  // 3D coordinate oracle. Focused portraits below must actually be visible.
  observations.push({overviewPortraitVisible:await page.locator('.map-presence__person').isVisible(),coordinateAlignment:'not_accepted_overview_packing_fixture',presence:await page.evaluate(()=>window.__map.presence.snapshot())});
  await check('Building selection moves camera and attendee portrait uses same authenticated proxy',async()=>{
    const before=await page.evaluate(()=>window.__map.snapshot());await page.evaluate(()=>{window.__map.select('bobst-library');window.__map.focus();});await page.waitForTimeout(1800);
    const after=await page.evaluate(()=>window.__map.snapshot());assert.equal(after.selected,'bobst-library');assert.notDeepEqual(after.camera,before.camera);assert.deepEqual(after.landmarks.find(b=>b.id==='bobst-library').bounds,before.landmarks.find(b=>b.id==='bobst-library').bounds);
    const card=page.locator('.map-presence__building-card');assert(await card.isVisible());await loaded('.map-presence__building-card img[src="'+proxy+'"]');assert(await page.locator('.map-presence__person').isVisible());
    assert.equal(await card.locator('img[src="'+proxy+'"]').count(),1);await page.screenshot({path:out+'/dynamic-focused.png'});return {selected:after.selected,currentImages:await page.locator('.map-presence__person img').count(),attendeeImages:await card.locator('img[src="'+proxy+'"]').count()};
  });
  await check('Burst of27 distinct storage-backed profiles loads every current and attendee image under bounded concurrency',async()=>{
    for(let i=1;i<27;i++){
      const id=randomUUID();data.people.push({id,display_name:'Synthetic Person '+(i+1),is_trackable:true,avatar_url:`${base}/storage/v1/object/authenticated/map-avatars/${id}/${hash}.png`});
      data.event_people.push({...data.event_people[0],person_id:id});
    }
    await refresh();await loaded('.map-presence__person img');await loaded('.map-presence__building-card .map-presence__event-attendees img');
    assert.equal(await page.locator('.map-presence__person img').count(),27);
    const attendeeImages=page.locator('.map-presence__building-card img[src^="/api/map/people/"]');assert.equal(await attendeeImages.count(),27);
    assert(await attendeeImages.evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth===1)));assert.equal(await indexHash(),beforeHash);
    await page.screenshot({path:out+'/burst27-focused.png'});return {currentPortraits:27,attendeePortraits:27,allLoaded:true,noRebuild:true};
  });
  await check('Wrong-person and foreign profile URLs render initials without foreign browser requests',async()=>{
    const selected=page.locator('.map-presence__person[data-person-id="'+pid+'"]');
    data.people[0].avatar_url=`/api/map/people/${randomUUID()}/avatar`;await refresh();assert.equal(await selected.locator('img').count(),0);
    data.people[0].avatar_url='https://attacker.example/avatar.png';await refresh();assert.equal(await selected.locator('img').count(),0);assert.equal(await page.locator('.map-presence__building-card img[src*="attacker"]').count(),0);assert.deepEqual(foreign,[]);return {initials:true,foreignRequests:0};
  });
  await check('Missing private object falls back to initials without breaking selection or later refresh recovery',async()=>{
    const missingId=randomUUID();failedPersonId=missingId;
    data.people.push({id:missingId,display_name:'Synthetic Missing Person',is_trackable:true,avatar_url:`${base}/storage/v1/object/authenticated/map-avatars/${missingId}/${hash}.png`});
    data.event_people.push({...data.event_people[0],person_id:missingId});
    await refresh();await page.waitForFunction(id=>document.querySelector('.map-presence__person[data-person-id="'+id+'"]')&&!document.querySelector('.map-presence__person[data-person-id="'+id+'"] img'),missingId);
    assert.equal((await page.evaluate(()=>window.__map.snapshot())).selected,'bobst-library');await page.screenshot({path:out+'/missing-object-initials.png'});
    failedPersonId=null;data.event_people.at(-1).label='Recovered';await refresh();await loaded('.map-presence__person[data-person-id="'+missingId+'"] img');return {fallback:true,recovered:true};
  });
  assert.deepEqual(errors,[]);assert.deepEqual(foreign,[]);assert.equal(await indexHash(),beforeHash);
}catch(e){fatal=e.message;console.error('FAIL '+fatal);process.exitCode=1;}
finally {
  await writeFile(out+'/browser-report.json',JSON.stringify({syntheticOnly:true,url,browser:browser.version(),checks,observations,errors,foreign,requests,fatal,upstreamRequests:upstream.length,limitations:['Headless Chrome software WebGL and a synthetic 1pixel PNG; no hosted source/storage/profile writes.','Real production build/website auth/API/avatar service/projection exercised with signed synthetic session header and inert same-origin upstream fetch.','Test adds a runtime UUID/profile after bundle load; no frontend rebuild during test.','Overview packing visibility/alignment is not accepted; actual visible portraits are required in focused mode. No geometry or camera implementation changes.']},null,2)+'\n');
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
