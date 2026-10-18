// Independent synthetic integration: actual 001–028 SQL, event store/services,
// current-source authorization, Hono, Vite, campus assets and installed Chrome.
// No hosted records, provider calls, deployment or private screenshots.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {chromium} from 'playwright-core';
import {serve} from '@hono/node-server';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createMapEventStore,createMapEventService} from '../server/map/events.js';
import {createMapPresenceService} from '../server/map/presence.js';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';

const out='evidence/events-relationships';
await fs.mkdir(out,{recursive:true});
const checks=[],errors=[],consoleErrors=[],requestFailures=[],externalRequests=[],typeAssetRequests=[],authorizations=[],rpcCalls=[];
const typeCodes=['study','meeting','event','social','other'],typeNames=['Study','Meeting','Event','Social','Other'];
const check=async(name,fn)=>{await fn();checks.push({name,pass:true});console.log('PASS '+name);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){try{if(await fn())return;}catch{}await wait(50);}throw Error('Fixture readiness timeout');}
async function freePort(){const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
const migrationDirectory=new URL('../supabase/migrations/',import.meta.url),migrationFiles=await fs.readdir(migrationDirectory);
const sid='22222222-2222-4222-8222-222222222222',deniedSid='22222222-2222-4222-8222-222222222223';
const personIds=[1,2,3,4].map(n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`);
const guildId='123456789012345678',channelId='234567890123456789',messageId='345678901234567890';
const sourceUrl=`https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
const deniedUrl=`https://discord.com/channels/${guildId}/${channelId}/345678901234567891`;
const principal={id:'synthetic-member',allowedSourceIds:[sid,deniedSid],liveDiscord:{mode:'local-operator',guildId}};
const now=Math.floor(Date.now()/60000)*60000,iso=offset=>new Date(now+offset*60000).toISOString();
let sourceEnabled=true,runtimeOutput='',browser,page,vite,api;
const db=new PGlite({extensions:{vector}});
const store=createMapEventStore({env:{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'},fetchImpl:async(url,options)=>{
  const endpoint=new URL(url).pathname,body=JSON.parse(options.body);rpcCalls.push(endpoint);
  if(endpoint==='/rest/v1/rpc/map_read_events')return Response.json((await db.query('select public.map_read_events($1::timestamptz) result',[body.p_at])).rows[0].result);
  if(endpoint==='/rest/v1/rpc/map_upsert_event'){
    try{return Response.json((await db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,$4::timestamptz) result',[JSON.stringify(body.p_event),JSON.stringify(body.p_buildings),JSON.stringify(body.p_people),body.p_expected_updated_at])).rows[0].result);}
    catch(error){return Response.json({code:error.code,message:'Synthetic database failure'},{status:400});}
  }
  throw Error('Unexpected storage transport');
}});
const liveDiscordService={configured:true,readMessages:async args=>{
  authorizations.push({channelId:args.channelId,messageId:args.messageId});
  return sourceEnabled&&args.messageId===messageId?{status:'ready',sources:[{sourceId:sid,url:sourceUrl,guildId,channelId,messageId}]}:{status:'forbidden',sources:[]};
}};
const authorizeSource=createMapSourceAuthorizer({liveDiscordService});
const eventService=createMapEventService({store,authorizeSource});
const presenceService=createMapPresenceService({store,authorizeSource,production:true});
const event=(key,patch={})=>({name:key,notes:'Synthetic event description',kind:'scheduled_event',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:iso(-30),ends_at:iso(90),time_zone:'America/New_York',source_id:sid,source_url:sourceUrl,source_record_id:`synthetic:${key}`,reported_at:iso(-30),...patch});
const participant=(n,patch={})=>({person_id:personIds[n-1],attendance_status:'going',presence_basis:'planned',label:`Synthetic activity ${n}`,source_id:sid,source_url:sourceUrl,reported_at:iso(-30),...patch});
const buildings=ids=>ids.map(building_id=>({building_id,location_notes:building_id==='bobst-library'?'Bobst · Test common area':'Synthetic room 202'}));
async function create(key,locations,people,patch={}){
  const result=await eventService.upsert({principal,event:event(key,patch),buildings:buildings(locations),people});assert.equal(result.status,'applied',key+': '+JSON.stringify(result));return result;
}
async function seed(key,locations,people,patch={}){
  // Deliberately retained unauthorized/cancelled rows are owner-inserted fixtures.
  const e=event(key,patch);const result=(await db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,null) result',[JSON.stringify(e),JSON.stringify(buildings(locations)),JSON.stringify(people)])).rows[0].result;assert.equal(result.status,'applied');return result;
}
const apiPort=await freePort(),webPort=await freePort(),url=`http://127.0.0.1:${webPort}`;
try{
  await check('Real SQL001–028 applies and removes legacy building JSON',async()=>{
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    for(let n=1;n<=28;n++){const file=migrationFiles.find(file=>file.endsWith('.sql')&&Number(file.slice(8,12))===n);assert(file,`Migration ${n}`);await db.exec(await fs.readFile(new URL(file,migrationDirectory),'utf8'));}
    assert.deepEqual((await db.query("select column_name from information_schema.columns where table_name='map_buildings' and column_name in('people_here','scheduled_events')")).rows,[]);
    await db.exec('delete from public.map_people');
    for(let i=0;i<4;i++)await db.query('insert into public.map_people(id,display_name,first_name,avatar_url,email) values($1,$2,$3,$4,$5)',[personIds[i],['Synthetic One','Synthetic Two','PRIVATE denied participant','Synthetic Future'][i],'Synthetic','/assets/avatars/'+['Yuyang.png','Khidir.png','Arda.png','Bianca.png'][i],`PRIVATE_PROFILE_${i}@example.invalid`]);
  });
  await check('Actual event service/store creates one event with two buildings and two people',async()=>{
    await create('Synthetic multi-building project',['bobst-library','courant-institute'],[participant(1),participant(2)]);
    await create('Synthetic overlapping study',['bobst-library'],[participant(1,{presence_basis:'reported',label:'Synthetic overlapping activity',reported_at:iso(-5)})],{kind:'presence',reported_at:iso(-5)});
    await create('Synthetic blank newest presence',['bobst-library'],[participant(1,{presence_basis:'reported',label:'',reported_at:iso(-1)})],{kind:'presence',reported_at:iso(-1)});
    await create('Synthetic future Kimmel',['nyu-kimmel-center'],[participant(1,{label:'Synthetic future Kimmel'}),participant(4)],{kind:'personal_plan',starts_at:iso(180),ends_at:iso(240)});
    await create('Synthetic future Bobst',['bobst-library'],[participant(1,{label:'Synthetic future Bobst'})],{kind:'personal_plan',starts_at:iso(180),ends_at:iso(240)});
    await create('Synthetic cancelled',['bobst-library'],[participant(4)],{status:'cancelled'});
    await create('Synthetic declined',['bobst-library'],[participant(4,{attendance_status:'declined'})]);
    await create('Synthetic unknown time',['bobst-library'],[participant(4)],{time_kind:'unknown',starts_at:null,ends_at:null});
    await create('Synthetic tentative event',['bobst-library'],[participant(4)],{status:'tentative'});
    await create('Synthetic future participant',['courant-institute'],[participant(4,{starts_at:iso(30),label:'Future participant'})]);
    await create('Synthetic departed participant',['courant-institute'],[participant(4,{ends_at:iso(-10)})]);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),nextDay=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
    await create('Synthetic all-day Stern plan',['stern-school-of-business'],[participant(1,{label:''}),participant(2,{label:''})],{kind:'personal_plan',time_kind:'all_day',starts_at:null,ends_at:null,starts_on:day,ends_on:nextDay});
    await create('Synthetic public empty scheduled',['bobst-library'],[]);
    await seed('PRIVATE denied event',['bobst-library'],[participant(1)],{source_id:deniedSid,source_url:deniedUrl});
    await seed('Synthetic independent participant permission',['bobst-library'],[participant(3,{source_id:deniedSid,source_url:deniedUrl})]);
    await seed('PRIVATE denied personal plan',['bobst-library'],[participant(3,{source_id:deniedSid,source_url:deniedUrl})],{kind:'personal_plan'});
    await seed('PRIVATE declined personal plan',['bobst-library'],[participant(1,{attendance_status:'declined'})],{kind:'personal_plan'});
    await seed('PRIVATE expired personal plan',['bobst-library'],[participant(1)],{kind:'personal_plan',starts_at:iso(-90),ends_at:iso(-45)});
    await seed('PRIVATE departed personal plan',['bobst-library'],[participant(1,{ends_at:iso(-10)})],{kind:'personal_plan'});
    await seed('PRIVATE orphan presence',['bobst-library'],[],{kind:'presence'});
    await seed('PRIVATE superseded presence',['bobst-library'],[participant(1)],{kind:'presence',status:'superseded'});
    for(const type_id of typeCodes)await create(`Synthetic type ${type_id}`,['bobst-library'],[participant(2,{label:''})],{type_id,starts_at:iso(-31)});
    assert(rpcCalls.includes('/rest/v1/rpc/map_upsert_event'));assert(authorizations.length>10);
  });
  let projected;
  await check('SQL→store→projection shows every linked building, overlaps deduplicate and future stays upcoming',async()=>{
    projected=await presenceService.read({principal});assert.equal(projected.status,'ok');
    for(const id of ['bobst-library','courant-institute','stern-school-of-business'])assert.deepEqual(projected.buildings.find(b=>b.id===id).people.map(p=>p.id).sort(),personIds.slice(0,2));
    assert.equal(projected.buildings.find(b=>b.id==='nyu-kimmel-center').people.length,0);
    const currentPerson=projected.buildings.find(b=>b.id==='bobst-library').people.find(p=>p.id===personIds[0]);
    assert.equal(currentPerson.activities.length,3);assert.equal(currentPerson.label,'Synthetic overlapping activity');
    assert.equal(projected.upcoming.filter(p=>p.personId===personIds[0]).length,2);
    const serialized=JSON.stringify(projected);assert(!serialized.includes('PRIVATE'));assert(!serialized.includes('source_id'));assert(!serialized.includes('discord_user_id'));assert(!serialized.includes('source_record_id'));
    assert(!projected.buildings.some(b=>b.people.some(p=>p.id===personIds[3])));
    assert(!projected.buildings.some(b=>b.events.some(e=>e.title.includes('cancelled')||e.title.includes('unknown'))));
    const bobst=projected.buildings.find(b=>b.id==='bobst-library');assert.equal(bobst.events.find(e=>e.title==='Synthetic multi-building project').attendees.length,2);
    assert.deepEqual(bobst.events.find(e=>e.title==='Synthetic independent participant permission').attendees,[]);
    assert.deepEqual(bobst.events.find(e=>e.title==='Synthetic public empty scheduled').attendees,[]);
    for(const title of ['Synthetic overlapping study','Synthetic blank newest presence','Synthetic future Bobst'])assert(bobst.events.some(e=>e.title===title),title);
    const stern=projected.buildings.find(b=>b.id==='stern-school-of-business');assert.equal(stern.events.length,1);assert.equal(stern.events[0].title,'Synthetic all-day Stern plan');assert.equal(stern.events[0].allDay,true);assert.equal(stern.events[0].attendees.length,2);
    assert(stern.people.every(p=>p.label===''));
  });
  await check('Trusted event reads expose exactly five fixed types and safe API event metadata',async()=>{
    const read=await eventService.read({principal,sourceRecordId:'synthetic:does-not-exist'});assert.equal(read.status,'ok');assert.deepEqual(read.events,[]);
    assert.deepEqual(read.event_types.map(type=>type.code),typeCodes);assert.deepEqual(read.event_types.map(type=>type.icon_key),typeCodes);
    assert.deepEqual(read.event_types.map(type=>type.name),typeNames);
    const bobst=projected.buildings.find(building=>building.id==='bobst-library');
    for(const [index,code] of typeCodes.entries())assert.deepEqual(bobst.events.find(event=>event.title===`Synthetic type ${code}`).type,{code,name:typeNames[index],iconKey:code});
  });
  const env={...process.env,PORT:String(apiPort),NODE_ENV:'development',LLM_API_KEY:'',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',ASSISTANT_ALLOWED_SOURCE_IDS:sid,DEV_ALLOWED_SOURCE_IDS:sid};
  const app=createApp({config:readConfig(env),mapPresenceService:presenceService,auth:async()=>principal});
  api=serve({fetch:app.fetch,port:apiPort,hostname:'127.0.0.1'});
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{env,stdio:['ignore','pipe','pipe']});vite.stdout.on('data',b=>runtimeOutput+=b);vite.stderr.on('data',b=>runtimeOutput+=b);
  await until(async()=>{const response=await fetch(url+'/api/map/presence');return response.ok;});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')consoleErrors.push(e.text());});page.on('requestfailed',r=>requestFailures.push({url:r.url().replace(url,''),error:r.failure()?.errorText}));page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).hostname!=='127.0.0.1')externalRequests.push(request.url());if(request.url().includes('event-icons'))typeAssetRequests.push(request.url());});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__map?.snapshot().status==='ready',null,{timeout:120000});
  await check('Actual campus loads and renders six normalized person/building markers',async()=>{
    assert.deepEqual((await page.evaluate(()=>window.__map.snapshot())).failed,[]);
    await page.waitForFunction(()=>window.__map.presence.snapshot().status==='ok');
    assert.equal((await page.evaluate(()=>window.__map.presence.snapshot())).count,6);
    assert.equal(await page.locator('.map-presence__person').count(),6);
    assert.equal(await page.locator(`[data-person-id="${personIds[3]}"]`).count(),0);
    await page.waitForFunction(()=>document.querySelector('#app')?.dataset.state==='entered');await page.waitForTimeout(1000);
    await page.screenshot({path:`${out}/overview-synthetic.png`});
  });
  const initialLandmarks=(await page.evaluate(()=>window.__map.snapshot())).landmarks;
  let bobstCamera;
  await check('Bobst selection/focus displays scheduled events and actual attendee portraits',async()=>{
    await page.evaluate(()=>{window.__map.select('bobst-library');window.__map.focus();});await page.waitForTimeout(2200);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});await card.waitFor({state:'visible'});
    assert.match(await card.textContent(),/Synthetic multi-building project/);assert.match(await card.textContent(),/Scheduled events/);
    for(const title of ['Synthetic overlapping study','Synthetic blank newest presence','Synthetic future Bobst','Synthetic public empty scheduled'])assert.match(await card.textContent(),new RegExp(title));
    assert(!/PRIVATE|Synthetic cancelled|Synthetic unknown time/.test(await card.textContent()));
    const row=card.locator('li').filter({hasText:'Synthetic multi-building project'});assert.equal(await row.locator('.map-presence__event-avatar').count(),2);
    assert.equal(await row.locator('.map-presence__event-avatar img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth>0).length),2);
    assert.equal(await page.locator('[data-building-id="bobst-library"] .map-presence__person:visible').count(),2);
    assert.equal(await page.locator(`[data-building-id="bobst-library"] [data-person-id="${personIds[0]}"] .map-presence__note-text`).textContent(),'Synthetic overlapping activity');
    for(const code of typeCodes){
      const typedRow=card.locator('li').filter({hasText:`Synthetic type ${code}`});
      assert.equal(await typedRow.locator('.map-presence__event-type').count(),0);
      assert.equal(await typedRow.locator('.map-presence__event-room').textContent(),'Test common area');
      assert.match(await typedRow.locator('time').textContent(),/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /);
      assert(Number(await typedRow.locator('time').evaluate(element=>getComputedStyle(element).fontWeight))>=650);
      const time=await typedRow.locator('time').boundingBox(),room=await typedRow.locator('.map-presence__event-room').boundingBox();assert(room.y>=time.y+time.height-1);
    }
    bobstCamera=(await page.evaluate(()=>window.__map.snapshot())).camera;
    await page.screenshot({path:`${out}/bobst-events-synthetic.png`});
  });
  await check('Courant transition preserves complete geometry bounds and shows same participants',async()=>{
    await page.evaluate(()=>{window.__map.select('courant-institute');window.__map.focus();});await page.waitForTimeout(2200);
    const state=await page.evaluate(()=>window.__map.snapshot());assert.equal(state.selected,'courant-institute');assert.notDeepEqual(state.camera,bobstCamera);
    for(const id of ['bobst-library','courant-institute']){const before=initialLandmarks.find(b=>b.id===id),after=state.landmarks.find(b=>b.id===id);assert.deepEqual(after.bounds,before.bounds);assert.equal(after.meshes,before.meshes);assert.equal(after.triangles,before.triangles);assert(after.meshes>0);}
    assert.equal(await page.locator('[data-building-id="courant-institute"] .map-presence__person:visible').count(),2);
    assert.equal(await page.locator('[data-building-id="bobst-library"] .map-presence__person:visible').count(),0);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert.match(await card.textContent(),/Synthetic multi-building project/);
    await page.screenshot({path:`${out}/courant-events-synthetic.png`});
  });
  await check('Stern all-day personal plan appears in building card with blank-label participants',async()=>{
    await page.evaluate(()=>{window.__map.select('stern-school-of-business');window.__map.focus();});await page.waitForTimeout(2200);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert(await card.isVisible());
    assert.match(await card.textContent(),/Synthetic all-day Stern plan/);assert.match(await card.textContent(),/All day/);assert.equal(await card.locator('li').count(),1);
    assert.equal(await card.locator('.map-presence__event-avatar img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth>0).length),2);
    assert.equal(await page.locator('[data-building-id="stern-school-of-business"] .map-presence__person:visible').count(),2);
    assert.equal(await page.locator('[data-building-id="stern-school-of-business"] .map-presence__note').count(),0);
    await page.screenshot({path:`${out}/stern-plan-synthetic.png`});
  });
  await check('Future Kimmel personal plan has a building card and portraits without current avatars',async()=>{
    await page.evaluate(()=>{window.__map.select('nyu-kimmel-center');window.__map.focus();});await page.waitForTimeout(2200);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert(await card.isVisible());assert.match(await card.textContent(),/Synthetic future Kimmel/);
    assert.equal(await card.locator('.map-presence__event-avatar').count(),2);assert.equal(await page.locator('[data-building-id="nyu-kimmel-center"] .map-presence__person').count(),0);
    await until(async()=>await card.locator('.map-presence__event-avatar img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth>0).length)===2);
    await page.waitForTimeout(250);
    const portraits=await card.locator('.map-presence__event-avatar').evaluateAll(avatars=>avatars.map(avatar=>{const box=avatar.getBoundingClientRect(),image=avatar.querySelector('img'),style=getComputedStyle(image),top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return {name:image.alt,x:box.x,y:box.y,width:box.width,height:box.height,opacity:style.opacity,visibility:style.visibility,uncovered:avatar.contains(top)};}));
    assert.equal(portraits.length,2);assert(portraits.every(p=>p.width>=28&&p.height>=28&&p.opacity==='1'&&p.visibility==='visible'&&p.uncovered),JSON.stringify(portraits));
    assert(Math.hypot(portraits[0].x-portraits[1].x,portraits[0].y-portraits[1].y)>=36,JSON.stringify(portraits));
    await page.screenshot({path:`${out}/kimmel-future-plan-synthetic.png`});
    await page.evaluate(()=>{window.__map.select('courant-institute');window.__map.focus();});await page.waitForTimeout(2200);
  });
  await check('Person schedule includes simultaneous locations and future plans without early avatars',async()=>{
    const person=page.locator(`[data-building-id="courant-institute"] [data-person-id="${personIds[0]}"]`);await person.click();
    const schedule=page.getByRole('complementary',{name:'Person schedule',exact:true});await schedule.waitFor({state:'visible'});
    assert.match(await schedule.textContent(),/Synthetic future Kimmel/);assert.match(await schedule.textContent(),/Synthetic future Bobst/);
    assert.match(await schedule.textContent(),/Stern/);assert.equal(await page.locator('[data-building-id="nyu-kimmel-center"] .map-presence__person').count(),0);
    await page.screenshot({path:`${out}/person-schedule-synthetic.png`});
    await person.click();
  });
  await check('Person schedule retains a future return to the currently focused building',async()=>{
    await page.evaluate(()=>{window.__map.select('bobst-library');window.__map.focus();});await page.waitForTimeout(2000);
    const person=page.locator(`[data-building-id="bobst-library"] [data-person-id="${personIds[0]}"]`);await person.click();
    const schedule=page.getByRole('complementary',{name:'Person schedule',exact:true});await schedule.waitFor({state:'visible'});
    assert.match(await schedule.textContent(),/Synthetic future Bobst/);
    await person.click();await page.evaluate(()=>{window.__map.select('courant-institute');window.__map.focus();});await page.waitForTimeout(2000);
  });
  await check('390px actual map keeps scheduled cards/attendees usable without page overflow',async()=>{
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(900);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert(await card.isVisible());
    const box=await card.boundingBox();assert(box.x>=0&&box.x+box.width<=390.1&&box.y>=0&&box.y+box.height<=844.1,JSON.stringify(box));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.screenshot({path:`${out}/mobile-events-synthetic.png`});
  });
  let injectedPayload=null;
  const injectRoute=async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(injectedPayload)});
  await check('390px five-type cards have no category icons, full-width details and portraits below',async()=>{
    injectedPayload=structuredClone(projected);for(const building of injectedPayload.buildings)building.events=building.id==='bobst-library'?building.events.filter(event=>event.title.startsWith('Synthetic type ')):[];
    await page.route('**/api/map/presence',injectRoute);await page.evaluate(()=>window.__map.presence.refresh());
    await page.evaluate(()=>{window.__map.select('bobst-library');window.__map.focus();});await page.waitForTimeout(2200);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert.equal(await card.locator('li').count(),5);
    for(const code of typeCodes){
      const row=card.locator('li').filter({hasText:`Synthetic type ${code}`}),details=row.locator('.map-presence__event-details'),attendees=row.locator('.map-presence__event-attendees');
      assert.equal(await row.locator('.map-presence__event-type').count(),0);assert.equal(await row.locator('img').count(),1);
      const text=await details.boundingBox(),portraits=await attendees.boundingBox();assert(text.width>=100,JSON.stringify(text));
      assert.equal(await row.evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),1);
      assert(portraits.y>=text.y+text.height-1,JSON.stringify({text,portraits}));
      assert.equal(await row.locator('.map-presence__event-avatar img').evaluateAll(images=>images.filter(image=>image.complete&&image.naturalWidth>0).length),1);
      assert.equal(await row.locator('.map-presence__event-room').textContent(),'Test common area');assert(Number(await row.locator('time').evaluate(element=>getComputedStyle(element).fontWeight))>=650);
    }
    await card.evaluate(element=>element.scrollTop=0);await page.screenshot({path:`${out}/mobile-types-top-synthetic.png`});
    await card.evaluate(element=>element.scrollTop=element.scrollHeight);await page.waitForTimeout(100);await page.screenshot({path:`${out}/mobile-types-bottom-synthetic.png`});
    assert(await card.locator('li').last().locator('.map-presence__event-avatar').evaluate(avatar=>{const box=avatar.getBoundingClientRect();return avatar.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));}),'Last attendee portrait must remain uncovered by the fixed assistant launcher');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  });
  await check('Missing, unknown and malicious unused type metadata never creates icons or asset requests',async()=>{
    await page.setViewportSize({width:1440,height:1000});const original=projected.buildings.find(building=>building.id==='bobst-library').events.find(event=>event.title==='Synthetic type study');
    const variants=[undefined,{code:'unknown',name:'Untrusted category',iconKey:'unknown'},{code:'study',name:'Untrusted icon',iconKey:'https://evil.example/pixel.png'}];
    injectedPayload=structuredClone(projected);for(const building of injectedPayload.buildings)building.events=building.id==='bobst-library'?variants.map((type,index)=>({...original,id:`synthetic-fallback-${index}`,title:`Synthetic fallback ${index}`,type})):[];
    await page.evaluate(()=>window.__map.presence.refresh());await page.waitForTimeout(500);
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert.equal(await card.locator('li').count(),3);
    assert.equal(await card.locator('.map-presence__event-type, img[src*="event-icons"]').count(),0);
    assert.equal(await card.locator('.map-presence__event-avatar img').count(),3);
    assert.deepEqual(externalRequests,[]);assert.deepEqual(typeAssetRequests,[]);await page.screenshot({path:`${out}/untrusted-types-synthetic.png`});
    await page.unroute('**/api/map/presence',injectRoute);injectedPayload=null;await page.evaluate(()=>window.__map.presence.refresh());
    await page.evaluate(()=>{window.__map.select('courant-institute');window.__map.focus();});await page.waitForTimeout(2000);
  });
  await check('Actual frontend accepts over 200 scheduled events and Tokyo all-day uses its local date',async()=>{
    await page.setViewportSize({width:1440,height:1000});
    for(let i=0;i<201;i++)await seed(`Synthetic capacity ${String(i).padStart(3,'0')}`,['courant-institute'],[],{starts_at:iso(300+i),ends_at:iso(360+i)});
    const day=new Date(now+3*86400000).toISOString().slice(0,10),nextDay=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
    await seed('Synthetic Tokyo all day',['courant-institute'],[],{time_kind:'all_day',starts_at:null,ends_at:null,starts_on:day,ends_on:nextDay,time_zone:'Asia/Tokyo'});
    await page.evaluate(()=>window.__map.presence.refresh());
    assert.equal((await page.evaluate(()=>window.__map.presence.snapshot())).status,'ok');
    const card=page.getByRole('complementary',{name:'Building activity',exact:true});assert.equal(await card.locator('li').filter({hasText:'Synthetic capacity'}).count(),201);
    const expected=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',weekday:'short',month:'short',day:'numeric'}).format(new Date(`${day}T00:00:00+09:00`));
    assert.equal(await card.locator('li').filter({hasText:'Synthetic Tokyo all day'}).locator('time').textContent(),`${expected} · All day`);
  });
  await check('Current source revocation removes event/participant data in actual UI on refresh',async()=>{
    sourceEnabled=false;await page.evaluate(()=>window.__map.presence.refresh());
    assert.equal((await page.evaluate(()=>window.__map.presence.snapshot())).count,0);
    assert.equal(await page.locator('.map-presence__person').count(),0);
    assert.match(await page.getByRole('complementary',{name:'Building activity',exact:true}).textContent(),/No scheduled events recorded/);
    const response=await fetch(url+'/api/map/presence'),body=await response.text();assert.equal(response.headers.get('cache-control'),'no-store');assert(!body.includes('Synthetic multi-building project'));assert(!body.includes('PRIVATE'));
  });
  await check('No uncaught browser errors, category images or category asset requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(typeAssetRequests,[]);assert.deepEqual(externalRequests,[]);assert.equal(await page.locator('.map-presence__event-type, img[src*="event-icons"]').count(),0);});
  await fs.writeFile(`${out}/browser-report.json`,JSON.stringify({status:'pass',checks,errors,consoleErrors,requestFailures,externalRequests,typeAssetRequests,runtime:{apiPort,webPort},rpcCallCount:rpcCalls.length,currentPolicyChecks:authorizations.length,viewports:[[1440,1000],[390,844]],limits:['Synthetic PGlite database and injected Discord message service, real SQL/RPC adapters and frontend.','Five-type mobile/untrusted-metadata cases inject synthetic authorized projections at the HTTP browser boundary; normal checks use real SQL/runtime responses.','No hosted migration, real member data, live bot/model, production authentication or deployment tested.','Chrome headless desktop/device-size emulation; no physical mobile/touch/GPU performance claim.','Unchanged geometry bounds and real camera transitions checked; no new geometry or full visual-coordinate survey.']},null,2)+'\n');
  console.log(`${checks.length}/${checks.length} independent events integration/browser checks passed`);
}catch(error){await fs.writeFile(`${out}/browser-report.json`,JSON.stringify({status:'fail',message:error.message,stack:error.stack,checks,errors,consoleErrors,requestFailures,runtimeOutput},null,2)+'\n');if(page)await page.screenshot({path:`${out}/failure-synthetic.png`});throw error;}
finally{
  await browser?.close();
  if(vite&&vite.exitCode===null){vite.kill('SIGTERM');const timer=setTimeout(()=>vite.kill('SIGKILL'),7000);await once(vite,'exit');clearTimeout(timer);}
  if(api){api.closeAllConnections();await new Promise(resolve=>api.close(resolve));}
  await db.close();
}
