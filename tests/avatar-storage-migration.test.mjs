import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrateAvatarStorage} from '../scripts/map-avatar-storage.mjs';

const base='https://jssehnrmqhstcrtxulpa.supabase.co',pid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XsAAAAASUVORK5CYII=','base64');
async function fixture(t,{anonStatus=403,publicStatus=400,anonBody,publicBody={code:'NoSuchBucket',statusCode:'404'}}={}) {
  const root=await mkdtemp(join(tmpdir(),'synthetic-avatar-migration-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'assets/avatars'),{recursive:true});await writeFile(join(root,'assets/avatars/Synthetic.png'),png);
  const rows=[{id:pid,display_name:'Synthetic Person',first_name:'Synthetic',last_name:'Person',discord_user_id:'400',email:'synthetic@example.invalid',is_trackable:true,avatar_url:'/assets/avatars/Synthetic.png',updated_at:'2026-10-21T17:00:00Z'},
    {id:other,display_name:'Unrelated Person',first_name:'Unrelated',is_trackable:false,avatar_url:null,updated_at:'2026-10-20T17:00:00Z'}];
  const before=structuredClone(rows),objects=new Map(),calls=[];let bucket=null,storedCorrupt=false,patches=0,race=false;
  const fetchImpl=async(value,options={})=>{
    const u=new URL(value);assert.equal(u.origin,base,'No real or arbitrary origin may be contacted');assert.equal(options.redirect,'error');
    const method=options.method??'GET';calls.push({url:u.href,method,headers:new Headers(options.headers),body:options.body});
    const h=new Headers(options.headers),authorized=h.get('authorization')==='Bearer synthetic-migration-key';
    if(!authorized){const isPublic=u.pathname.includes('/object/public/'),status=isPublic?publicStatus:anonStatus,body=isPublic?publicBody:anonBody;return body!==undefined?Response.json(body,{status}):new Response(null,{status});}
    if(u.pathname==='/rest/v1/map_people') {
      if(method==='GET')return Response.json(u.searchParams.has('id')?rows.filter(row=>'eq.'+row.id===u.searchParams.get('id')):rows);
      assert.equal(method,'PATCH');const patch=JSON.parse(options.body);assert.deepEqual(Object.keys(patch),['avatar_url']);patches++;
      if(race){rows[0].display_name='Concurrent human edit';rows[0].updated_at='2026-10-21T20:00:00Z';}
      const row=rows.find(row=>'eq.'+row.id===u.searchParams.get('id')&&'eq.'+row.avatar_url===u.searchParams.get('avatar_url')&&'eq.'+row.updated_at===u.searchParams.get('updated_at'));
      if(!row)return Response.json([]);Object.assign(row,patch,{updated_at:'2026-10-21T18:00:00Z'});return Response.json([row]);
    }
    if(u.pathname==='/storage/v1/bucket') {
      if(method==='GET')return Response.json(bucket?[bucket]:[]);
      assert.equal(method,'POST');bucket=JSON.parse(options.body);return Response.json(bucket);
    }
    if(u.pathname==='/storage/v1/bucket/map-avatars')return Response.json(bucket);
    if(u.pathname.startsWith('/storage/v1/object/map-avatars/')) {
      assert.equal(method,'POST');assert.equal(h.get('x-upsert'),'false');const key=u.pathname.slice('/storage/v1/object/map-avatars/'.length);
      if(objects.has(key))return new Response(null,{status:409});objects.set(key,Buffer.from(options.body));return Response.json({Key:key});
    }
    if(u.pathname.startsWith('/storage/v1/object/authenticated/map-avatars/')) {
      const bytes=objects.get(u.pathname.slice('/storage/v1/object/authenticated/map-avatars/'.length));if(!bytes)return new Response(null,{status:404});
      const body=Buffer.from(bytes);if(storedCorrupt)body[body.length-1]^=1;return new Response(body,{headers:{'content-type':'image/png'}});
    }
    throw Error('Unexpected synthetic upstream path');
  };
  const manifestPath=join(root,'evidence/storage-avatars/manifest.json');
  const run=(options={})=>migrateAvatarStorage({root,manifestPath,fetchImpl,env:{SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'synthetic-migration-key'},...options});
  return {run,rows,before,calls,objects,manifestPath,patches:()=>patches,corrupt:()=>{storedCorrupt=true;},race:()=>{race=true;},setBucket:value=>{bucket=value;}};
}
test('operator requires exact project and explicit deployment readiness before any apply I/O',async t=>{
  const f=await fixture(t);
  await assert.rejects(()=>f.run({mode:'apply'}),/deploy_compatible_web_before_profile_updates/);assert.equal(f.calls.length,0);
  await assert.rejects(()=>f.run({env:{SUPABASE_URL:'https://attacker.example',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}}),/unexpected_or_unconfigured_project/);assert.equal(f.calls.length,0);
  await assert.rejects(()=>f.run({mode:'apply',webReady:true}),/upload_manifest_required/);assert.equal(f.calls.length,0);
});
test('planning is read-only; upload verifies private SHA objects but preserves every profile before apply',async t=>{
  const f=await fixture(t),plan=await f.run();assert.equal(plan.profileWrites,0);assert.equal(plan.profiles,1);assert(f.calls.every(call=>call.method==='GET'));
  const result=await f.run({mode:'upload'});assert.equal(result.verifiedObjects,1);assert.equal(result.migratedProfiles,0);assert.equal(f.patches(),0);assert.deepEqual(f.rows,f.before);
  const manifest=JSON.parse(await readFile(f.manifestPath,'utf8'));assert.equal(manifest.rows[0].verified,true);assert.equal(manifest.rows[0].after,null);assert.equal((await stat(f.manifestPath)).mode&0o777,0o600);
  const anonymous=f.calls.filter(call=>call.url.includes('/object/')&&!call.headers.has('authorization'));assert.equal(anonymous.length,2);assert(anonymous.some(call=>call.url.includes('/object/public/')));assert(anonymous.some(call=>call.url.includes('/object/authenticated/')));
  await f.run({mode:'upload'});assert.equal(f.objects.size,1);assert.equal(f.patches(),0);assert.deepEqual(f.rows,f.before);
});
test('apply patches only avatar_url with exact id/old URL/version CAS; retry skips already applied row',async t=>{
  const f=await fixture(t);await f.run({mode:'upload'});const result=await f.run({mode:'apply',webReady:true});assert.equal(result.migratedProfiles,1);assert.equal(f.patches(),1);
  const patch=f.calls.find(call=>call.method==='PATCH'),u=new URL(patch.url);assert.equal(u.searchParams.get('id'),'eq.'+pid);assert.equal(u.searchParams.get('avatar_url'),'eq.'+f.before[0].avatar_url);assert.equal(u.searchParams.get('updated_at'),'eq.'+f.before[0].updated_at);
  assert.deepEqual(JSON.parse(patch.body),{avatar_url:f.rows[0].avatar_url});assert.match(f.rows[0].avatar_url,/\/object\/authenticated\/map-avatars\//);
  for(const key of Object.keys(f.before[0]).filter(key=>!['avatar_url','updated_at'].includes(key)))assert.equal(f.rows[0][key],f.before[0][key]);assert.deepEqual(f.rows[1],f.before[1]);
  await f.run({mode:'apply',webReady:true});assert.equal(f.patches(),1);
});
for(const [name,change,error] of [['name',row=>{row.display_name='Human edit';},'profile_identity_changed'],['version',row=>{row.updated_at='2026-10-21T19:00:00Z';},'profile_write_conflict'],['portrait',row=>{row.avatar_url='/assets/avatars/Human.png';},'profile_write_conflict']])test(`changed ${name} is preserved without an avatar PATCH`,async t=>{
  const f=await fixture(t);await f.run({mode:'upload'});change(f.rows[0]);const preserved=structuredClone(f.rows);await assert.rejects(()=>f.run({mode:'apply',webReady:true}),new RegExp(error));assert.equal(f.patches(),0);assert.deepEqual(f.rows,preserved);
});
test('stored SHA mismatch prevents apply without touching profiles',async t=>{
  const f=await fixture(t);await f.run({mode:'upload'});f.corrupt();await assert.rejects(()=>f.run({mode:'apply',webReady:true}),/stored_object_hash_mismatch/);assert.equal(f.patches(),0);assert.deepEqual(f.rows,f.before);
});
test('concurrent human edit between read and PATCH is protected by database predicates',async t=>{
  const f=await fixture(t);await f.run({mode:'upload'});f.race();await assert.rejects(()=>f.run({mode:'apply',webReady:true}),/profile_write_conflict/);
  assert.equal(f.patches(),1);assert.equal(f.rows[0].display_name,'Concurrent human edit');assert.equal(f.rows[0].avatar_url,f.before[0].avatar_url);assert.deepEqual(f.rows[1],f.before[1]);
});
test('unexpected public bucket policy blocks any object upload or profile change',async t=>{
  const f=await fixture(t);f.setBucket({id:'map-avatars',public:true,file_size_limit:4194304,allowed_mime_types:['image/png']});await assert.rejects(()=>f.run({mode:'upload'}),/unexpected_bucket_policy/);
  assert.equal(f.objects.size,0);assert.equal(f.patches(),0);assert.deepEqual(f.rows,f.before);
});
for(const [name,statuses] of [['anonymous exposed',{anonStatus:200}],['public exposed',{publicStatus:200}],['anonymous indeterminate',{anonStatus:503}],['public indeterminate',{publicStatus:503}],['unrelated400',{publicStatus:400,publicBody:{code:'DatabaseUnavailable',statusCode:'400'}}]])test(`${name} cannot establish private object acceptance`,async t=>{
  const f=await fixture(t,statuses);await assert.rejects(()=>f.run({mode:'upload'}),/object_exposed_anonymously|object_privacy_(?:unverified|not_verified)/);assert.equal(f.patches(),0);assert.deepEqual(f.rows,f.before);
});
