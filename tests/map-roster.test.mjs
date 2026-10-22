import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {normalizeName,splitAvatarName,avatarRoster,createMatchPlan} from '../server/map/roster.js';
import {createDiscordRosterClient,createRosterStore,applyMatchPlan} from '../server/map/discord-roster.js';
import {runRoster} from '../scripts/map-roster.mjs';

const person=(name,extra={})=>({id:`person-${name}`,display_name:name,first_name:name.split(' ')[0],last_name:name==='Sean Lai'?'Lai':null,discord_user_id:null,...extra});
const member=(id,nick,extra={})=>({id,nick,global_name:null,username:`user${id}`,bot:false,...extra});
const scan=(query,members,extra={})=>({query,complete:true,members,...extra});
const plan=(people,members,extra={})=>createMatchPlan({people,scans:[scan(people[0].first_name,members,extra)]});

test('avatar roster covers the current PNG inventory with conservative first/last names and encoded URLs',async()=>{
 const files=(await readdir(new URL('../assets/avatars/',import.meta.url))).filter(f=>f.endsWith('.png'));
 const rows=avatarRoster(files);assert.equal(rows.length,files.length);assert(files.includes('Grace.png'));
 assert.deepEqual(rows.map(p=>decodeURIComponent(p.avatar_url.split('/').at(-1))).sort(),files.sort());
 for(const row of rows){assert.equal(row.first_name,row.display_name.split(' ')[0]);assert.equal(row.last_name,row.display_name==='Sean Lai'?'Lai':null);assert(!/\s/.test(row.avatar_url));}
 assert.deepEqual(rows.find(row=>row.avatar_url==='/assets/avatars/Grace.png'),{display_name:'Grace',first_name:'Grace',last_name:null,avatar_url:'/assets/avatars/Grace.png'},'A filename alone cannot invent Grace\'s surname or linked Discord identity');
 assert.deepEqual(splitAvatarName('Sean H.png'),{display_name:'Sean H',first_name:'Sean',last_name:null});
 assert.throws(()=>splitAvatarName('../Other.png'));assert.throws(()=>splitAvatarName('Other.jpg'));
});

test('name normalization handles accents/case/punctuation; unique explicit first token can match',()=>{
 assert.equal(normalizeName('  JÉNNIFER__Huang! '),'jennifer huang');
 const [row]=plan([person('Bianca')],[member('11','BÍANCA Example')]);assert.equal(row.status,'matched');assert.equal(row.match.discord_user_id,'11');
 assert.equal(row.match.last_name,'Example','only explicit two-token server nickname supplies a surname');
});

test('full names disambiguate; ambiguous first names/duplicate exact names never auto-link',()=>{
 const sean=person('Sean Lai');assert.equal(plan([sean],[member('11','Sean Hu'),member('12','Sean Lai')])[0].match.discord_user_id,'12');
 for(const people of [[person('Sean')],[person('Sean H')]]){
  const [row]=plan(people,[member('11','Sean Hu'),member('12','Sean Hu')]);assert.notEqual(row.status,'matched');assert.equal(row.match,undefined);
 }
 const [row]=plan([sean],[member('11','Sean Lai'),member('12','Sean Lai')]);assert.notEqual(row.status,'matched');
 assert.notEqual(plan([person('Sean H')],[member('11','Sean Hu')])[0].status,'matched','initial-only source label needs confirmation even with a unique candidate');
});

test('nickname Jennifer and glued username JenniferHuang remain ambiguous',()=>{
 const [row]=plan([person('Jennifer')],[member('11','Jennifer'),member('12','Huang',{username:'JenniferHuang'})]);assert.notEqual(row.status,'matched');assert.equal(row.match,undefined);assert.equal(row.candidates.length,2);
 const [shortSurname]=plan([person('Sam')],[member('11','Sam'),member('12',null,{username:'samli'})]);assert.notEqual(shortSurname.status,'matched','a short surname username is still an ambiguity blocker');
});

test('bots excluded; username prefix alone is insufficient and never invents surname',()=>{
 const [row]=plan([person('Laura')],[member('11','Laura Bot',{bot:true}),member('12',null,{username:'LauraWhatever'})]);assert.notEqual(row.status,'matched');assert.equal(row.match,undefined);assert(row.candidates.every(c=>c.id!=='11'));
 const [explicit]=plan([person('Laura')],[member('12','Laura',{username:'LauraWhatever'})]);assert.equal(explicit.status,'matched');assert.equal(explicit.match.last_name,undefined);
});

test('partial, missing, failed or capped searches never auto-link, including found exact matches',()=>{
 const p=person('Laura'),good=member('11','Laura Example');
 for(const extra of [{complete:false},{complete:true,error:'rate_limited'},{complete:true,error:'permission_denied'}])assert.notEqual(plan([p],[good],extra)[0].status,'matched');
 const capped=[good,...Array.from({length:99},(_,n)=>member(String(100+n),'Someone Else'))];assert.notEqual(plan([p],capped)[0].status,'matched');
 assert.notEqual(createMatchPlan({people:[p],scans:[scan('Different',[good]) ]})[0].status,'matched');
 assert.notEqual(createMatchPlan({people:[p],scans:[scan('Laura',[good]),scan('Laura',[],{complete:false})]})[0].status,'matched');
});

test('existing identities preserved and candidate IDs cannot be reused or claimed twice',()=>{
 const existing=person('Laura',{discord_user_id:'11'}),other=person('Jennifer');
 const rows=createMatchPlan({people:[existing,other],scans:[scan('Laura',[member('12','Laura')]),scan('Jennifer',[member('11','Jennifer')])]});
 assert.equal(rows[0].status,'already_linked');assert.equal(rows[0].match,undefined);assert.equal(rows[1].status,'conflict');assert.equal(rows[1].match,undefined);
 const duplicates=plan([person('Laura',{id:'p1'}),person('Laura',{id:'p2'})],[member('11','Laura')]);assert(duplicates.every(row=>row.status==='conflict'&&!row.match));
});

test('raw Discord nested member responses retain exact string IDs and require conservative surname evidence',()=>{
 const raw={nick:null,user:{id:'9007199254740993123',global_name:'Laura Example',username:'LauraExample',bot:false}};
 const [row]=plan([person('Laura')],[raw]);assert.equal(row.status,'matched');assert.equal(row.match.discord_user_id,raw.user.id);assert.equal(row.match.last_name,undefined);
});

const env={DISCORD_GUILD_ID:'1203562091500404776',DISCORD_BOT_TOKEN:'synthetic-bot-key',SUPABASE_URL:'https://jssehnrmqhstcrtxulpa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'};
const uid='11111111-1111-4111-8111-111111111111';

test('Discord requests are GET only, exact configured guild/origin, encoded query and100-result incompleteness',async()=>{
 const calls=[];const client=createDiscordRosterClient({env,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return Response.json(calls.length===1?{id:env.DISCORD_GUILD_ID,name:'Tech@NYU'}:Array.from({length:100},(_,i)=>member(String(i+1),'Laura')));}});
 assert.equal((await client.verifyGuild()).id,env.DISCORD_GUILD_ID);const result=await client.searchMembers('Laura & other');assert.equal(result.complete,false);assert.equal(result.members.length,100);
 for(const {url,options} of calls){assert.equal(url.origin,'https://discord.com');assert(url.pathname.startsWith('/api/v10/guilds/'+env.DISCORD_GUILD_ID));assert.equal(options.method,'GET');assert.equal(options.redirect,'error');}
 assert.equal(calls[1].url.searchParams.get('query'),'Laura & other');assert.equal(calls[1].url.searchParams.get('limit'),'100');
});

test('guild mismatches, bounded rate limit retries, malformed/oversize member responses fail closed',async()=>{
 await assert.rejects(createDiscordRosterClient({env,fetchImpl:async()=>Response.json({id:'1',name:'Tech@NYU'})}).verifyGuild(),e=>e.code==='unexpected_guild');
 let attempts=0,sleeps=0;const client=createDiscordRosterClient({env,sleepImpl:async()=>{sleeps++;},fetchImpl:async()=>{attempts++;return Response.json({retry_after:0},{status:429});}});
 await assert.rejects(client.searchMembers('Laura'),e=>e.code==='rate_limited');assert.equal(attempts,3);assert.equal(sleeps,2);
 for(const data of [{members:[]},[{user:{id:12}}],Array(101).fill(member('11','Laura'))])await assert.rejects(createDiscordRosterClient({env,fetchImpl:async()=>Response.json(data)}).searchMembers('Laura'),e=>e.code==='invalid_response');
 await assert.rejects(createDiscordRosterClient({env,fetchImpl:async()=>new Response('x'.repeat(500001))}).searchMembers('Laura'),e=>e.code==='response_too_large');
});

test('store writes use exact map_people endpoint and null-ID CAS; preserve manual surname/displayname',async()=>{
 const calls=[];const store=createRosterStore({env,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return Response.json([{id:uid}]);}});
 const p=person('Laura',{id:uid,discord_display_name:null});const match={discord_user_id:'11',discord_display_name:'Laura Example',last_name:'Example'};
 assert.equal((await store.linkPerson(p,match)).status,'applied');const {url,options}=calls[0];assert.equal(url.origin,env.SUPABASE_URL);assert.equal(url.pathname,'/rest/v1/map_people');assert.equal(options.method,'PATCH');assert.equal(options.redirect,'error');assert.equal(url.searchParams.get('id'),'eq.'+uid);assert.equal(url.searchParams.get('discord_user_id'),'is.null');assert.equal(url.searchParams.get('last_name'),'is.null');assert.equal(url.searchParams.get('first_name'),'eq.Laura');assert.equal(url.searchParams.get('display_name'),'eq.Laura');assert.equal(url.searchParams.get('discord_display_name'),'is.null');assert.deepEqual(JSON.parse(options.body),match);
 await store.linkPerson({...p,last_name:'Manual',discord_display_name:'Manual Name'},match);const second=calls[1];assert.equal(second.url.searchParams.get('discord_display_name'),'eq.Manual Name');assert.equal(second.url.searchParams.get('last_name'),'eq.Manual');assert(!Object.hasOwn(JSON.parse(second.options.body),'last_name'));assert(!Object.hasOwn(JSON.parse(second.options.body),'discord_display_name'));
 assert.equal((await store.linkPerson({...p,discord_user_id:'22'},match)).status,'conflict');assert.equal(calls.length,2);
 const raced=createRosterStore({env,fetchImpl:async()=>Response.json([])});assert.equal((await raced.linkPerson(p,match)).status,'conflict');
 const failed=createRosterStore({env,fetchImpl:async()=>Response.json({code:'23505'},{status:409})});await assert.rejects(failed.linkPerson(p,match),e=>e.code==='write_conflict');
});

test('store rejects unsafe origins and capped roster; apply helper skips pending and refuses duplicate claims',async()=>{
 for(const url of ['http://db.example','https://user:pass@db.example','https://db.example/path','https://db.example/?key=x'])assert.throws(()=>createRosterStore({env:{...env,SUPABASE_URL:url}}),e=>e.code==='supabase_not_configured');
 await assert.rejects(createRosterStore({env,fetchImpl:async()=>Response.json(Array(1000).fill({id:uid,display_name:'Laura'}))}).listPeople(),e=>e.code==='incomplete_people_list');
 const p=person('Laura',{id:uid}),calls=[];const store={linkPerson:async(...args)=>{calls.push(args);return {status:'applied'};}};
 const summary=await applyMatchPlan({people:[p],store,plan:[{person_id:uid,status:'pending'},{person_id:uid,status:'matched',match:{discord_user_id:'11'}}]});assert.equal(summary.applied,1);assert.equal(summary.skipped,1);assert.equal(calls.length,1);
 calls.length=0;const duplicate=await applyMatchPlan({people:[p],store,plan:[{person_id:uid,status:'matched',match:{discord_user_id:'11'}},{person_id:uid,status:'matched',match:{discord_user_id:'11'}}]});assert.equal(duplicate.failed,2);assert.equal(calls.length,0);
});

test('CLI defaults to proposal only; explicit apply patches only safe matches on configured guild/project',async()=>{
 const filenames=(await readdir(new URL('../assets/avatars/',import.meta.url))).filter(f=>f.endsWith('.png'));
 const people=avatarRoster(filenames).map((p,i)=>({...p,id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,discord_user_id:null,discord_display_name:null}));
 const calls=[];const fetchImpl=async(raw,options)=>{
  const url=new URL(raw);calls.push({url,options});
  if(url.origin==='https://discord.com'){
   assert(url.pathname.startsWith('/api/v10/guilds/'+env.DISCORD_GUILD_ID));assert.equal(options.method,'GET');
   if(!url.search)return Response.json({id:env.DISCORD_GUILD_ID,name:'Tech@NYU'});
   return Response.json(url.searchParams.get('query')==='laura'?[member('11','Laura Example')]:[]);
  }
  assert.equal(url.origin,env.SUPABASE_URL);assert.equal(url.pathname,'/rest/v1/map_people');
  if(options.method==='PATCH')return Response.json([{id:url.searchParams.get('id').slice(3)}]);return Response.json(people);
 };
 const proposal=await runRoster({env,args:[],fetchImpl,write:()=>{}});assert.equal(proposal.mode,'plan');assert.equal(proposal.plan.length,people.length);assert.equal(proposal.plan.filter(r=>r.status==='matched').length,1);assert(calls.every(c=>c.options.method==='GET'));
 calls.length=0;const applied=await runRoster({env,args:['--apply'],fetchImpl,write:()=>{}});assert.equal(applied.application.applied,1);assert.equal(calls.filter(c=>c.options.method==='PATCH').length,1);
 let unsafeCalls=0;for(const args of [['--guild=1'],['--project=other'],['--apply=true']])await assert.rejects(runRoster({env,args,fetchImpl:async()=>{unsafeCalls++;},write:()=>{}}),e=>e.code==='invalid_arguments');assert.equal(unsafeCalls,0);
});

test('CLI incomplete/error search cannot produce writes even with explicit apply',async()=>{
 const filenames=(await readdir(new URL('../assets/avatars/',import.meta.url))).filter(f=>f.endsWith('.png'));
 const people=avatarRoster(filenames).map((p,i)=>({...p,id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,discord_user_id:null,discord_display_name:null}));
 let writes=0;const result=await runRoster({env,args:['--apply'],write:()=>{},fetchImpl:async(raw,options)=>{
  const url=new URL(raw);if(options.method==='PATCH'){writes++;return Response.json([]);}
  if(url.origin===env.SUPABASE_URL)return Response.json(people);
  if(!url.search)return Response.json({id:env.DISCORD_GUILD_ID,name:'Tech@NYU'});
  return Response.json({message:'No access'},{status:403});
 }});assert.equal(writes,0);assert.equal(result.application.applied,0);assert(result.plan.every(r=>r.status==='pending'));
});
