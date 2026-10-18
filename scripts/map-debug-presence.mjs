// Explicit expiring UI fixtures in normalized events. Never real self-reports.
import {createMapEventStore} from '../server/map/events.js';
const sourceId = 'a7969a7a-53cc-4c75-9736-95dd386f1c5e';
const sourceUrl = 'https://example.invalid/tech-nyu/map-debug/bobst-fixture-v1';
const buildingId = 'bobst-library';
const labels = ['Arda', 'Bianca', 'Charice', 'Enoch', 'Yuyang'];
const args = process.argv.slice(2);
if (args.length !== 1 || !['--apply', '--clear'].includes(args[0])) {
  console.error('Usage: node --env-file-if-exists=.env scripts/map-debug-presence.mjs --apply|--clear');
  process.exit(1);
}
if (process.env.SUPABASE_URL?.replace(/\/$/,'') !== 'https://jssehnrmqhstcrtxulpa.supabase.co') throw Error('Expected configured Tech NYU Supabase project');
const store = createMapEventStore();
if (!store.configured) throw Error('Expected configured server credentials');
const at = new Date().toISOString();
const snapshot = await store.read({observedAt:at});
const links = event => snapshot.event_buildings.filter(b=>b.event_id===event.id);
const participants = event => snapshot.event_people.filter(p=>p.event_id===event.id);
const fixtures = snapshot.events.filter(e=>e.source_id===sourceId && e.source_url===sourceUrl);
if (fixtures.some(e=>e.kind!=='personal_plan' || links(e).length!==1 || links(e)[0].building_id!==buildingId || participants(e).length!==1
  || participants(e).some(p=>p.source_id!==sourceId || p.source_url!==sourceUrl || p.presence_basis!=='planned'))) throw Error('Unexpected fixture relationships; refusing to modify');
const eventFields = ['id','name','notes','kind','status','time_kind','starts_at','ends_at','starts_on','ends_on','time_zone','source_id','source_url','source_record_id','url','reported_at'];
const personFields = ['person_id','attendance_status','presence_basis','label','starts_at','ends_at','source_id','source_url','reported_at'];
const pick = (row,keys) => Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
async function put(event,people,expectedUpdatedAt=null) {
  const result = await store.upsert({event:pick(event,eventFields),buildings:[{building_id:buildingId,location_notes:''}],people:people.map(p=>pick(p,personFields)),expectedUpdatedAt});
  if (result.status!=='applied') throw Error('Fixture write conflicted; inspect current state before retrying');
}
let changed=0;
if (args[0]==='--clear') {
  for (const event of fixtures.filter(e=>e.status!=='cancelled')) {
    await put({...event,status:'cancelled'},participants(event),event.updated_at);changed++;
  }
} else {
  const selected = labels.map(label=>{
    const found=snapshot.people.filter(p=>p.is_trackable && (p.display_name===label || p.display_name.startsWith(label+' ')));
    if(found.length!==1)throw Error('Expected one trackable fixture identity per selected name');return found[0];
  });
  if (!snapshot.buildings.some(b=>b.id===buildingId)) throw Error('Bobst building not found');
  const endsAt = new Date(Date.parse(at)+24*60*60*1000).toISOString();
  // Cancel previous fixtures before reseeding. Never replace unrelated events.
  for(const event of fixtures.filter(e=>e.status!=='cancelled')) await put({...event,status:'cancelled'},participants(event),event.updated_at);
  for(const person of selected) {
    const sourceRecordId=`map-debug-presence-v2:${person.id}:${at}`;
    await put({name:'UI fixture',notes:'Explicit temporary UI fixture, not a real location report.',kind:'personal_plan',status:'confirmed',time_kind:'timed',starts_at:at,ends_at:endsAt,time_zone:'America/New_York',source_id:sourceId,source_url:sourceUrl,source_record_id:sourceRecordId,reported_at:at},[
      {person_id:person.id,attendance_status:'going',presence_basis:'planned',label:'Test',source_id:sourceId,source_url:sourceUrl,reported_at:at},
    ]);changed++;
  }
}
const fresh = await store.read({observedAt:new Date().toISOString()});
const active = fresh.events.filter(e=>e.source_id===sourceId && e.source_url===sourceUrl && e.status==='confirmed' && Date.parse(e.ends_at)>Date.now());
if (active.length!==(args[0]==='--clear'?0:labels.length)) throw Error('Fixture verification failed');
console.log(JSON.stringify({buildingId,action:args[0].slice(2),changed,verified:true}));
