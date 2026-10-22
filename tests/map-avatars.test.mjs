import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMapAvatarService} from '../server/map/avatars.js';
import {safeAvatar,safePerson,createMapEventService} from '../server/map/events.js';
import {createMapPresenceService} from '../server/map/presence.js';
import {resolveMapAvatarUrl} from '../src/map-avatar-url.js';
import {createApp} from '../server/app.js';
import {readConfig} from '../server/config.js';
import {createWebsite} from '../server/web.js';
import {createSiteAuth,readSiteAuthConfig} from '../server/site-auth.js';

const pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const sid='33333333-3333-4333-8333-333333333333',eid='44444444-4444-4444-8444-444444444444';
const base='https://synthetic.supabase.co';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XsAAAAASUVORK5CYII=','base64'));
const hash=createHash('sha256').update(png).digest('hex');
const savedSupabaseUrl=process.env.SUPABASE_URL;process.env.SUPABASE_URL=base;
after(()=>{if(savedSupabaseUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=savedSupabaseUrl;});
const proxy=id=>`/api/map/people/${id}/avatar`;
const objectUrl=(id=pid)=>`${base}/storage/v1/object/authenticated/map-avatars/${id}/${hash}.png`;
const env={SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-service-key'};
const principal={id:'synthetic-member',allowedSourceIds:[sid]};
const profile=(patch={})=>({id:pid,avatar_url:objectUrl(),is_trackable:true,...patch});
function fixture({rows=[profile()],binary=()=>new Response(png,{headers:{'content-type':'image/png'}}),profileResponse,timeoutMs=100,fetchImpl,...extra}={}) {
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url:String(url),options});
    if(fetchImpl)return fetchImpl(url,options);
    if(new URL(url).pathname==='/rest/v1/map_people')return profileResponse?profileResponse():Response.json(rows);
    return binary(url,options);
  };
  return {calls,service:createMapAvatarService({env,fetchImpl:fetcher,timeoutMs,...extra})};
}
const read=f=>f.service.read({personId:pid,principal});
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:(...args)=>resolve(...args)};};

test('avatar reads authenticate and validate ID/config before any external request',async()=>{
  const f=fixture();
  for(const principal_ of [null,{}, {id:'forged'}, {id:'',allowedSourceIds:[]}])assert.equal((await f.service.read({personId:pid,principal:principal_})).status,'forbidden');
  for(const personId of ['',null,'../secret',pid+'/avatar',pid+'?x=1','not-a-uuid'])assert.equal((await f.service.read({personId,principal})).status,'invalid');
  assert.equal(f.calls.length,0);
  for(const config of [{},{SUPABASE_URL:'https://user:pass@synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}, {...env,SUPABASE_URL:base+'/unexpected'}, {...env,SUPABASE_URL:base+'?secret=1'}]) {
    let calls=0;const s=createMapAvatarService({env:config,fetchImpl:async()=>{calls++;throw Error('unexpected');}});
    assert.equal(s.configured,false);assert.notEqual((await s.read({personId:pid,principal})).status,'ok');assert.equal(calls,0);
  }
});
test('exact profile and private object yield byte-identical PNG without public URL or redirects',async()=>{
  const f=fixture(),r=await read(f);assert.equal(r.status,'ok');assert.equal(r.contentType,'image/png');assert.deepEqual(r.bytes,png);
  assert.equal(f.calls.length,2);
  const lookup=new URL(f.calls[0].url);assert.equal(lookup.origin,base);assert.equal(lookup.pathname,'/rest/v1/map_people');
  assert.equal(lookup.searchParams.get('id'),`eq.${pid}`);assert(lookup.searchParams.get('select').split(',').includes('is_trackable'));
  assert.equal(f.calls[1].url,objectUrl());
  for(const {options} of f.calls){assert.equal(options.method??'GET','GET');assert.equal(options.redirect,'error');const h=new Headers(options.headers);assert.equal(h.get('apikey'),env.SUPABASE_SERVICE_ROLE_KEY);assert.equal(h.get('authorization'),'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);}
});
for(const [name,rows] of [['absent',[]],['disabled',[profile({is_trackable:false})]],['wrong identity',[profile({id:other})]],['duplicate',[profile(),profile()]],['no image',[profile({avatar_url:null})]]]) {
  test(`profile ${name} never fetches an image`,async()=>{const f=fixture({rows});assert.notEqual((await read(f)).status,'ok');assert.equal(f.calls.length,1);});
}
const hostileUrls=[
  'https://attacker.example/leak.png',`https://synthetic.supabase.co.attacker.example/storage/v1/object/authenticated/map-avatars/${pid}/${hash}.png`,
  `${base}/storage/v1/object/public/map-avatars/${pid}/${hash}.png`,objectUrl(other),objectUrl()+'?token=synthetic',objectUrl()+'#x',
  `${base}/storage/v1/object/authenticated/other-bucket/${pid}/${hash}.png`,`${base}/storage/v1/object/authenticated/map-avatars/${pid}/../${other}/${hash}.png`,
  `${base}/storage/v1/object/authenticated/map-avatars/${pid}/%2e%2e/${hash}.png`,`${base}/storage/v1/object/authenticated/map-avatars/${pid}/%2f${hash}.png`,
  objectUrl().replace('/authenticated/','/sign/'),objectUrl().replace(hash,'A'.repeat(64)),objectUrl().replace(hash,'a'.repeat(63)),objectUrl().replace('.png','.svg'),
  objectUrl().replace('https:','http:'),objectUrl().replace('https://','https://user:pass@'),proxy(pid),'/assets/avatars/Unknown.png',objectUrl()+'\n',
];
for(const [index,url] of hostileUrls.entries())test(`untrusted profile image URL ${index+1} cannot trigger arbitrary server fetch`,async()=>{
  const f=fixture({rows:[profile({avatar_url:url})]});assert.notEqual((await read(f)).status,'ok');assert.equal(f.calls.length,1);
  assert(!JSON.stringify(await read(f)).includes('synthetic-test-service-key'));
});
for(const [name,response] of [
  ['redirect',()=>new Response(null,{status:302,headers:{location:'https://attacker.example'}})],
  ['missing object',()=>new Response('private original',{status:404})],
  ['wrong mime',()=>new Response(png,{headers:{'content-type':'image/svg+xml'}})],
  ['HTML mislabeled PNG',()=>new Response('<html>private original</html>',{headers:{'content-type':'image/png'}})],
  ['short signature',()=>new Response(png.slice(0,7),{headers:{'content-type':'image/png'}})],
  ['huge declared length',()=>new Response(png,{headers:{'content-type':'image/png','content-length':String(4*1024*1024+1)}})],
  ['huge streamed body',()=>new Response(new Uint8Array(4*1024*1024+1),{headers:{'content-type':'image/png'}})],
  ['zero width',()=>{const bytes=png.slice();bytes.fill(0,16,20);return new Response(bytes,{headers:{'content-type':'image/png'}});}],
  ['missing IHDR',()=>{const bytes=png.slice();bytes[12]=0;return new Response(bytes,{headers:{'content-type':'image/png'}});}],
  ['digest mismatch',()=>{const bytes=png.slice();bytes[bytes.length-1]^=1;return new Response(bytes,{headers:{'content-type':'image/png'}});}],
])test(`binary ${name} is denied and error bodies remain private`,async()=>{
  const f=fixture({binary:response}),r=await read(f);assert.notEqual(r.status,'ok');assert(!JSON.stringify(r).includes('private original'));assert(!JSON.stringify(r).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});
test('malformed/oversized/redirected profile reads fail closed with sanitized outcomes',async()=>{
  for(const response of [()=>new Response('PRIVATE_ORIGINAL',{status:500}),()=>new Response('not JSON'),()=>Response.json({rows:[profile()]}),()=>new Response(null,{status:302,headers:{location:'https://attacker.example'}}),()=>new Response('x'.repeat(256000),{headers:{'content-type':'application/json'}})]) {
    const f=fixture({profileResponse:response}),r=await read(f);assert.notEqual(r.status,'ok');assert.equal(f.calls.length,1);assert(!JSON.stringify(r).includes('PRIVATE_ORIGINAL'));
  }
});
test('one deadline bounds ignored abort signals in profile fetch and binary stream',async()=>{
  for(const phase of ['profile','image']) {
    let imageSignal;
    const f=fixture({timeoutMs:30,...(phase==='profile'?{fetchImpl:()=>new Promise(()=>{})}:{binary:(_url,options)=>{imageSignal=options.signal;return new Response(new ReadableStream({start(){},cancel(){return new Promise(()=>{});}}),{headers:{'content-type':'image/png'}});}})});
    const start=performance.now(),r=await read(f);assert.equal(r.status,'unavailable');assert(performance.now()-start<600,'Deadline must bound ignored fetch/body cancellation');if(imageSignal)assert.equal(imageSignal.aborted,true);
  }
});
test('caller cancellation stops active profile work and queued requests without leaking errors',async()=>{
  const controller=new AbortController(),started=deferred();let observed;
  const f=fixture({timeoutMs:1000,maxConcurrent:1,fetchImpl:(_url,options)=>{observed=options.signal;started.resolve();return new Promise(()=>{});}});
  const first=f.service.read({personId:pid,principal,signal:controller.signal});await started.promise;
  const waiting=f.service.read({personId:other,principal,signal:controller.signal});controller.abort();
  for(const r of await Promise.all([first,waiting]))assert.notEqual(r.status,'ok');assert(observed.aborted);assert.equal(f.calls.length,1);
});
test('normal burst queues beyond four active jobs and every requested image eventually succeeds',async()=>{
  const gates=[],f=fixture({timeoutMs:1500,fetchImpl:(url)=>{const gate=deferred();gates.push({gate,url:String(url)});return gate.promise;}});
  const requests=Array.from({length:8},()=>f.service.read({personId:pid,principal}));
  await new Promise(resolve=>setTimeout(resolve,20));assert(gates.length<=4);assert(gates.length>0);
  for(let rounds=0;rounds<25;rounds++) {
    assert(gates.length<=4);const current=gates.splice(0);for(const {gate,url} of current)gate.resolve(new URL(url).pathname==='/rest/v1/map_people'?Response.json([profile()]):new Response(png,{headers:{'content-type':'image/png'}}));
    await new Promise(resolve=>setTimeout(resolve,5));if(!gates.length)break;
  }
  const results=await Promise.all(requests);assert.equal(results.filter(r=>r.status==='ok').length,8,'Ordinary image bursts must queue rather than leave permanent initials');
});
test('four hung upstreams retain slots, only64 waiting jobs are accepted and cancellation starts no extra requests',async()=>{
  const controller=new AbortController(),f=fixture({timeoutMs:1500,fetchImpl:()=>new Promise(()=>{})}),outcomes=Array(69).fill(null);
  const requests=outcomes.map((_,index)=>f.service.read({personId:pid,principal,signal:controller.signal}).then(r=>{outcomes[index]=r;return r;}));
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.calls.length,4);assert.equal(outcomes.filter(Boolean).length,1,'Only job69 exceeds the bounded active+waiting capacity');assert.equal(outcomes[68].status,'unavailable');
  controller.abort();await Promise.all(requests);assert.equal(f.calls.length,4);assert(outcomes.every(r=>r.status==='unavailable'));
});
test('queued avatar deadline starts at request arrival and expired waiters never begin upstream work',async()=>{
  const f=fixture({timeoutMs:45,maxConcurrent:1,fetchImpl:()=>new Promise(()=>{})});
  const active=read(f);await new Promise(resolve=>setTimeout(resolve,15));const start=performance.now();
  const waiting=f.service.read({personId:other,principal});
  const result=await Promise.race([waiting,new Promise((_,reject)=>setTimeout(()=>reject(Error('Queued deadline exceeded')),250))]);
  assert.equal(result.status,'unavailable');assert(performance.now()-start<150);assert.equal(f.calls.length,1);assert.equal((await active).status,'unavailable');
});

test('person-bound backend proxy is idempotent and frontend resolves only exact private proxy or approved legacy asset',()=>{
  const local='/assets/avatars/Synthetic%20Member.png',legacy=new Map([['Synthetic Member.png','/assets/Synthetic-bundle.png']]);
  assert.equal(safeAvatar(local,pid),local);assert.equal(resolveMapAvatarUrl(local,pid,legacy),'/assets/Synthetic-bundle.png');
  assert.equal(safeAvatar(objectUrl(),pid),proxy(pid));assert.equal(safeAvatar(proxy(pid),pid),proxy(pid));
  assert.equal(safePerson(safePerson({...profile(),display_name:'Synthetic Member'})).avatar_url,proxy(pid));
  assert.equal(resolveMapAvatarUrl(proxy(pid),pid),proxy(pid));
  for(const url of [proxy(other),proxy(pid)+'?x=1',proxy(pid)+'#x',proxy(pid)+'\n',proxy(pid).replace('avatar','%61vatar'),base+proxy(pid),'//attacker.example/a.png',objectUrl(),'/assets/avatars/../secret.png','/assets/avatars/%2fsecret.png','/assets/avatars/Unknown.png'])assert.equal(resolveMapAvatarUrl(url,pid,legacy),null,url);
  for(const url of [proxy(other),proxy(pid)+'?x=1',objectUrl(other),objectUrl()+'#x','https://attacker.example/photo.png'])assert.equal(safeAvatar(url,pid),null,url);
});
test('safePerson and production normalized projection preserve private avatar for current people and event attendees without Storage URL leakage',async()=>{
  const at='2026-10-21T18:00:00Z',url='https://discord.com/channels/100/200/300';
  const data={event_types:['study','meeting','event','social','other'].map((code,index)=>({code,name:code,description:'',icon_key:code,sort_order:index})),buildings:[{id:'bobst-library',name:'Bobst'}],
    people:[{...profile(),display_name:'Synthetic Member'}],events:[{id:eid,name:'Synthetic session',notes:'',kind:'presence',type_id:'other',status:'confirmed',time_kind:'timed',starts_at:'2026-10-21T17:00:00Z',ends_at:'2026-10-21T19:00:00Z',time_zone:'America/New_York',source_id:sid,source_url:url,source_record_id:'300',reported_at:'2026-10-21T17:00:00Z',updated_at:at}],
    event_buildings:[{event_id:eid,building_id:'bobst-library',location_notes:''}],event_people:[{event_id:eid,person_id:pid,attendance_status:'going',presence_basis:'reported',label:'',source_id:sid,source_url:url,reported_at:'2026-10-21T17:00:00Z'}]};
  const store={configured:true,read:async()=>data},s=createMapEventService({store,authorizeSource:async()=>true,now:()=>new Date(at)});
  const read=await s.read({principal});assert.equal(read.people[0].avatar_url,proxy(pid));
  const normalized={...data,people:read.people},r=await createMapPresenceService({store:{configured:true,read:async()=>normalized},production:true,authorizeSource:async()=>true,now:()=>new Date(at)}).read({principal});
  assert.equal(r.status,'ok');assert.equal(r.buildings[0].people[0].avatarUrl,proxy(pid));assert.equal(r.buildings[0].events[0].attendees[0].avatarUrl,proxy(pid));assert(!JSON.stringify(r).includes('storage/v1'));
});
test('production avatar HTTP route requires a verified site session before touching avatar service',async()=>{
  const config=readConfig({NODE_ENV:'production'}),authEnv={PUBLIC_ORIGIN:'https://synthetic.example',SITE_ACCESS_PASSWORD:'synthetic-only-password',SITE_SESSION_SECRET:'synthetic-only-session-secret-123456789'};
  const auth=createSiteAuth({config:readSiteAuthConfig(authEnv),apiConfig:config});let calls=0;
  const app=createWebsite({siteAuth:auth,apiApp:createApp({config,auth:auth.auth,mapAvatarService:{configured:true,read:async args=>{calls++;assert.equal(args.personId,pid);return {status:'ok',bytes:png,contentType:'image/png'};}}})});
  const cookie=auth.issue(authEnv.SITE_ACCESS_PASSWORD).split(';')[0],path='https://synthetic.example'+proxy(pid);
  for(const headers of [{},{cookie:cookie+'forged'},{cookie,'sec-fetch-site':'cross-site'},{cookie,'x-user-id':'admin',authorization:'Bearer forged','sec-fetch-site':'cross-site'}])assert.equal((await app.fetch(new Request(path,{headers}))).status,403);
  assert.equal(calls,0);
  const r=await app.fetch(new Request(path,{headers:{cookie,'sec-fetch-site':'same-origin'}}));assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),png);assert.equal(calls,1);
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-type'),/^image\/png/);
});
test('development avatar GET exemption is exact and cannot trust remote addresses, forwarded headers or foreign origins',async()=>{
  let calls=0;const app=createApp({config:readConfig({}),mapAvatarService:{configured:true,read:async()=>{calls++;return {status:'ok',bytes:png,contentType:'image/png'};}}});
  const request=(path=proxy(pid),headers={})=>new Request('http://localhost'+path,{headers});
  assert.equal((await app.fetch(request(),{incoming:{socket:{remoteAddress:'127.0.0.1'}}})).status,200);
  const before=calls;
  for(const [req,remote] of [[request(),null],[request(), '203.0.113.1'],[request(proxy(pid),{'x-forwarded-for':'127.0.0.1'}),'203.0.113.1'],[request(proxy(pid),{host:'evil.example'}),'127.0.0.1'],[request(proxy(pid),{origin:'https://evil.example'}),'127.0.0.1'],[request(proxy(pid),{'sec-fetch-site':'cross-site'}),'127.0.0.1']])assert.equal((await app.fetch(req,{incoming:{socket:{remoteAddress:remote}}})).status,403);
  assert.equal(calls,before);
  for(const path of [proxy(pid)+'/extra',proxy(pid)+'?x=1','/api/map/people/not-a-uuid/avatar'])assert.notEqual((await app.fetch(request(path),{incoming:{socket:{remoteAddress:'127.0.0.1'}}})).status,200);
});
