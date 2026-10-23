import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {createMapEventService} from '../server/map/events.js';
import {createMapPresenceService} from '../server/map/presence.js';
import {createMapTools} from '../tools/map/index.js';
import {createChatMapTools} from '../tools/map/chat.js';

// All identities/messages below are synthetic. No source API or hosted database
// is used. Optional configured-model checks reuse the existing inert harness.
const sid='22222222-2222-4222-8222-222222222222';
const pid='11111111-1111-4111-8111-111111111111';
const sourceUrl='https://discord.com/channels/100/200/300';
const building='nyu-leslie-elab-building';
const principal={id:'synthetic-tester',allowedSourceIds:[sid]};
const posted='2026-10-21T16:54:00.000Z';
const current='2026-10-21T17:00:00.000Z';
function args({future=false,record='300'}={}) {
  return {event:{name:'At eLab',notes:'',kind:future?'personal_plan':'presence',type_id:'other',status:'confirmed',time_kind:'timed',
    starts_at:future?'2026-10-21T20:00:00Z':posted,ends_at:'2026-10-21T21:00:00Z',time_zone:'America/New_York',
    source_id:sid,source_url:sourceUrl,source_record_id:record,reported_at:posted},
  buildings:[{building_id:building,location_notes:''}],people:[{person_id:pid,attendance_status:'going',presence_basis:future?'planned':'reported',
    label:'',source_id:sid,source_url:sourceUrl,reported_at:posted}]};
}
async function databaseFixture() {
  const db=new PGlite({extensions:{vector}});
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const dir=new URL('../supabase/migrations/',import.meta.url),files=await readdir(dir);
  for(let n=1;n<=36;n++) {
    const file=files.find(file=>file.endsWith('.sql')&&Number(file.slice(8,12))===n);assert(file);
    await db.exec(await readFile(new URL(file,dir),'utf8'));
  }
  await db.query('insert into public.map_people(id,display_name,first_name,discord_user_id) values($1,$2,$3,$4)',[pid,'Synthetic Member','Synthetic','400']);
  const store={configured:true,
    read:async()=> (await db.query('select public.map_read_events($1) value',[current])).rows[0].value,
    lookup:async({providerUserId})=> (await db.query('select * from public.map_people where discord_user_id=$1',[providerUserId])).rows[0]??null,
    upsert:async({event,buildings,people,expectedUpdatedAt})=>{
      try{return (await db.query('select public.map_upsert_event($1::jsonb,$2::jsonb,$3::jsonb,$4::timestamptz) value',
        [JSON.stringify(event),JSON.stringify(buildings),JSON.stringify(people),expectedUpdatedAt])).rows[0].value;}
      catch(error){if(error.code==='40001')return {status:'conflict'};throw error;}
    }};
  const service=createMapEventService({store,authorizeSource:async()=>true,now:()=>new Date(current)});
  const chat=message=>createChatMapTools({mapTools:createMapTools({service})}).createRequest({userMessage:message});
  const invoke=(request,name,arguments_)=>request.execute({name,arguments:arguments_,principal});
  const observe=request=>request.observe('read_discord_messages',{status:'ready',sources:[{kind:'discord',retrieval:'live',sourceId:sid,
    guildId:'100',channelId:'200',messageId:'300',url:sourceUrl,authorId:'400',excerpt:"I'm at eLab until 5pm."}]});
  const projection=at=>createMapPresenceService({store,authorizeSource:async()=>true,production:true,now:()=>new Date(at)}).read({principal});
  return {db,store,service,chat,invoke,observe,projection};
}

if(!process.argv.includes('--live-model')) {
  test('source-backed personal eLab activity creates with explicit end; active projection, SQL retry and correction keep one event',async()=>{
    const f=await databaseFixture();
    try {
      const request=f.chat(`Add the author's location to the map from ${sourceUrl}`),p=args();
      f.observe(request);
      const first=await f.invoke(request,'read_map_events',{sourceId:sid,sourceRecordId:'300'});
      assert.equal(first.status,'ready');assert.equal(first.events.length,0);assert(first.buildings.some(row=>row.id===building));
      assert.equal((await f.invoke(request,'lookup_map_person',{provider:'discord',providerUserId:'400',sourceId:sid,sourceUrl})).person.id,pid);
      const receipt=await f.invoke(request,'upsert_map_event',p);assert.equal(receipt.sourceStatus,'applied');
      const active=await f.projection(current),elab=active.buildings.find(row=>row.id===building);
      assert.equal(active.status,'ok');assert.equal(elab.people.length,1);assert.equal(elab.people[0].id,pid);
      assert.equal(elab.people[0].label,'','Location does not imply studying');assert.equal(elab.people[0].expiresAt,'2026-10-21T21:00:00.000Z');
      assert.equal(elab.events.length,1);assert.equal(elab.events[0].title,'At eLab');
      assert.equal((await f.service.upsert({...p,principal})).status,'conflict','Real SQL stable-source identity rejects a new-create retry');
      const fresh=await f.service.read({principal,sourceId:sid,sourceRecordId:'300'});assert.equal(fresh.events.length,1);
      const existing=fresh.events[0];
      const {created_at,updated_at,...old}=existing;
      assert.equal((await f.service.upsert({...p,event:{...old,name:'At eLab, corrected title'},expectedUpdatedAt:updated_at,principal})).status,'applied');
      const rows=(await f.db.query('select * from public.events where source_id=$1',[sid])).rows;
      assert.equal(rows.length,1);assert.equal(new Date(rows[0].ends_at).toISOString(),'2026-10-21T21:00:00.000Z');
      assert.equal((await f.projection('2026-10-21T21:00:00Z')).buildings.find(row=>row.id===building).people.length,0,'Expiry is exclusive');
    } finally {await f.db.close();}
  });
  test('future eLab plan stays upcoming until its exact supported start',async()=>{
    const f=await databaseFixture();
    try {
      const request=f.chat(`Add this original Discord location plan to the map: ${sourceUrl}`);f.observe(request);
      await f.invoke(request,'read_map_events',{});
      await f.invoke(request,'lookup_map_person',{provider:'discord',providerUserId:'400',sourceId:sid,sourceUrl});
      assert.equal((await f.invoke(request,'upsert_map_event',args({future:true}))).sourceStatus,'applied');
      const before=await f.projection(current);assert.equal(before.buildings.find(row=>row.id===building).people.length,0);
      assert.equal(before.upcoming.length,1);assert.equal(before.upcoming[0].validFrom,'2026-10-21T20:00:00.000Z');
      assert.equal((await f.projection('2026-10-21T20:00:00Z')).buildings.find(row=>row.id===building).people.length,1);
    } finally {await f.db.close();}
  });
  test('same-day until-only planned availability is visible from original report time, without claiming physical arrival',async()=>{
    const f=await databaseFixture();
    try {
      const p=args();p.event.kind='personal_plan';p.people[0].presence_basis='planned';
      const request=f.chat(`Add this author's stated availability to the map from ${sourceUrl}`);f.observe(request);
      await f.invoke(request,'read_map_events',{sourceId:sid,sourceRecordId:'300'});
      await f.invoke(request,'lookup_map_person',{provider:'discord',providerUserId:'400',sourceId:sid,sourceUrl});
      assert.equal((await f.invoke(request,'upsert_map_event',p)).sourceStatus,'applied');
      const stored=(await f.service.read({principal,sourceId:sid,sourceRecordId:'300'})).events[0];
      assert.equal(stored.kind,'personal_plan');assert.equal(new Date(stored.starts_at).toISOString(),posted);assert.equal(new Date(stored.ends_at).toISOString(),'2026-10-21T21:00:00.000Z');
      const view=await f.projection(current),occupant=view.buildings.find(row=>row.id===building).people[0];
      assert.equal(occupant.status,'planned');assert.equal(occupant.validFrom,posted);assert.equal(occupant.expiresAt,'2026-10-21T21:00:00.000Z');
      assert.equal(view.upcoming.length,0);assert.equal((await f.projection(occupant.expiresAt)).buildings.find(row=>row.id===building).people.length,0);
    } finally {await f.db.close();}
  });
} else {
  const original=new URL('../scripts/verify-agent-prompts.mjs',import.meta.url);
  let source=await readFile(original,'utf8');
  const replace=(needle,replacement)=>{assert(source.includes(needle),'Shared harness changed; review required');source=source.replace(needle,replacement);};
  replace("import {createProvider}","import {createMapPresenceService} from '../server/map/presence.js';\nimport {createProvider}");
  replace("MODEL_MIN_INTERVAL_MS=1000","MODEL_MIN_INTERVAL_MS=1500");
  source=source.replaceAll('../evidence/agent-prompts/','../evidence/personal-location-behavior/');
  source=source.replaceAll('scripts/verify-agent-prompts.mjs --live-model','tests/personal-location-behavior.test.mjs --live-model');
  replace("const monitoredPaths=['scripts/verify-agent-prompts.mjs'","const monitoredPaths=['tests/personal-location-behavior.test.mjs','scripts/verify-agent-prompts.mjs'");
  replace("{id:'bobst-library',name:'Bobst Library'}","{id:'nyu-leslie-elab-building',name:'Leslie eLab building',aliases:['eLab','Leslie eLab','16 Washington Place']}");
  const start=source.indexOf('const cases=['),end=source.indexOf('const selector=',start);assert(start>=0&&end>start);
  source=source.slice(0,start)+`
const syntheticCurrent="I'm at eLab until 5pm today (America/New_York).";
const syntheticFuture="I'll be at eLab today from 4pm until 5pm (America/New_York).";
const syntheticAvailability="I'll be at eLab until 5pm.";
async function assertLocation(f,future=false,availability=false) {
  assert.equal(f.state.mapWrites.length,1,'Expected one missing personal map event');
  assert.equal(f.state.calendarWrites.length,0,'Personal location is map-only');
  const write=f.state.mapWrites[0];
  assert.equal(write.event.kind,future||availability?'personal_plan':'presence');assert.equal(write.event.type_id,'other');
  assert.equal(instant(write.event.starts_at),future?'2026-10-18T20:00:00.000Z':posted);
  assert.equal(instant(write.event.ends_at),'2026-10-18T21:00:00.000Z','Keep explicit 5pm, never the two-hour default');
  assert.equal(instant(write.event.reported_at),posted);assert.equal(write.event.source_id,ids.discord);
  assert.equal(write.event.source_url,discordUrl);assert(write.event.source_record_id.includes(messageId));
  assert.deepEqual(write.buildings.map(row=>row.building_id),['nyu-leslie-elab-building']);
  assert.equal(write.people.length,1);assert.equal(write.people[0].person_id,ids.person);
  assert.equal(write.people[0].presence_basis,future||availability?'planned':'reported');assert.equal(write.people[0].label,'');
  assert(f.state.lookups.some(row=>row.providerUserId==='400'),'Exact linked author lookup required');
  const project=at=>createMapPresenceService({store:{configured:true,read:async()=>copy(f.state.snapshot)},
    authorizeSource:async()=>true,production:true,now:()=>new Date(at)}).read({principal:{id:'synthetic',allowedSourceIds:[ids.discord]}});
  const projected=await project(now);assert.equal(projected.status,'ok');
  const elab=projected.buildings.find(row=>row.id==='nyu-leslie-elab-building');
  assert.equal(elab.people.length,future?0:1);assert.equal(projected.upcoming.length,future?1:0);
  assert.equal((await project('2026-10-18T20:00:00Z')).buildings.find(row=>row.id==='nyu-leslie-elab-building').people.length,1);
  assert.equal((await project('2026-10-18T21:00:00Z')).buildings.find(row=>row.id==='nyu-leslie-elab-building').people.length,0);
}
const cases=[
 ['chat-until-only-elab',async()=>{const {f}=await runChat('Please add this original Discord location plan to the map: '+discordUrl,{content:syntheticAvailability,events:[]});await assertLocation(f,false,true);}],
 ['chat-current-elab',async()=>{const {f}=await runChat('Please add the author to the map from this original Discord message: '+discordUrl,{content:syntheticCurrent,events:[]});await assertLocation(f);}],
 ['chat-future-elab',async()=>{const {f}=await runChat('Please add this original Discord location plan to the map: '+discordUrl,{content:syntheticFuture,events:[]});await assertLocation(f,true);}],
];
`+source.slice(end);
  source=source.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,prefix,path,suffix)=>prefix+new URL(path,original).href+suffix);
  source=source.replaceAll('import.meta.url',JSON.stringify(original.href));
  try {await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
  catch(error) {console.error('Synthetic model harness failed: '+String(error.message).slice(0,400));process.exitCode=1;}
}
