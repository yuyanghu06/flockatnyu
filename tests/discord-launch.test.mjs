import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {readDiscordConfig} from '../server/discord/config.js';
import {createDiscordClient} from '../server/discord/client.js';
import {runDailyWorker} from '../server/worker.js';
import {snowflakeBefore} from '../server/discord/sync.js';
import {parseDiscordCliArgs, runDiscordPreflight, registerDiscordChannels, runDiscordBackfill, runDiscordOneShot, runDiscordCli} from '../server/discord/cli.js';
import {prepareDiscordDeployment} from '../tools/prepare-discord-deploy.mjs';

const guildId = '123456789012345678', channelId = '234567890123456789', otherChannel = '234567890123456790';
const memberId = '11111111-1111-4111-8111-111111111111', sourceId = '22222222-2222-4222-8222-222222222222';
const token = 'fixture-bot-token-DO-NOT-PRINT', serviceKey = 'fixture-role-key-DO-NOT-PRINT';
const env = {DISCORD_BOT_TOKEN:token,DISCORD_GUILD_ID:guildId,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:serviceKey,DISCORD_OPERATOR_MEMBER_ID:memberId};
const fullHistory = '2015-01-01T00:00:00.000Z';
const instant = new Date('2026-10-11T12:00:00.000Z');
const channel = {sourceId,channelId,guildId,title:'Events',enabled:true,backfillFrom:fullHistory};
function rawMessage(time, sequence = 1) {
  return {id:(BigInt(snowflakeBefore(time))+BigInt(sequence)).toString(),channel_id:channelId,author:{id:'345678901234567890',username:'Fixture'},timestamp:new Date(time).toISOString(),content:'Fixture original history'};
}
function fixture({messages = [], channels = [channel], admin = true} = {}) {
  const states = new Map(), rows = new Map(), writes = [], readChannels = [], messageReads = [], stateReads = [];
  const app = {id:'456789012345678901',flags:1 << 18};
  const client = {configured:true,
    async getCurrentApplication() {return app;},
    async getGuild() {return {id:guildId,name:'Fixture guild'};},
    async getChannel({channelId:id}) {readChannels.push(id); return {id,guild_id:guildId,type:0,name:'Fixture channel'};},
    async getMessages(args) {messageReads.push(args); return messages.filter(m => m.channel_id === args.channelId && (args.before == null || BigInt(m.id)<BigInt(args.before))).sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1).slice(0,args.limit);},
  };
  const store = {configured:true,
    async listSyncChannels() {return {status:'ready',channels};},
    async listChannels({principal}) {return admin && principal?.id === memberId && principal.isAdmin === true ? {status:'ready',channels} : {status:'forbidden',channels:[]};},
    async configureChannel({principal,channel:entry}) {
      if (!admin || principal?.id !== memberId || principal.isAdmin !== true) return {status:'forbidden'};
      writes.push(structuredClone(entry)); const saved = {...entry,sourceId}; channels.push(saved); return {status:'ready',channel:saved};
    },
    async getSyncState({sourceId:id}) {stateReads.push(id); return {status:'ready',state:states.get(id) || null};},
    async persistPage({channel:entry,messages:page,state}) {
      const old = states.get(entry.sourceId);
      assert.equal(state.expectedBefore,old?.before ?? null,'checkpoint must compare current cursor');
      assert.equal(state.expectedWindowTo,old?.windowTo ?? null,'checkpoint must compare current window');
      assert.equal(state.expectedLastSuccessAt,old?.lastSuccessAt ?? null,'checkpoint must compare current success');
      for (const m of page) rows.set(m.messageId,structuredClone(m));
      states.set(entry.sourceId,structuredClone(state)); return {status:'ready'};
    },
  };
  return {env:{...env},config:readDiscordConfig(env),store,client,channelIds:[channelId],now:()=>instant,app,states,rows,writes,readChannels,messageReads,stateReads,messages};
}
function clean(result) {
  const output = JSON.stringify(result);
  assert(!output.includes(token)); assert(!output.includes(serviceKey)); assert(!output.includes('malicious-body'));
  return result;
}
function failed(result) {clean(result); assert(result.exitCode > 0,JSON.stringify(result));}

test('application preflight fetch is authenticated and selected guild lookup rejects foreign response', async () => {
  const requests = [];
  const client = createDiscordClient({config:readDiscordConfig(env),fetchImpl:async (url,options)=> {
    requests.push({url,options});
    return Response.json(url.endsWith('/oauth2/applications/@me')?{id:'456789012345678901',flags:1<<18}:{id:'999999999999999999'});
  }});
  assert.equal((await client.getCurrentApplication()).flags,1<<18);
  assert.equal(requests[0].options.headers.Authorization,`Bot ${token}`);
  await assert.rejects(client.getGuild(),{code:'channel_scope_denied'});
  assert.equal(new URL(requests[1].url).pathname,`/api/v10/guilds/${guildId}`);
});

test('client preflight exceptions never expose transport/token bodies', async () => {
  const client = createDiscordClient({config:readDiscordConfig(env),fetchImpl:async()=> {throw new Error(`${token} malicious-body`);}});
  for (const method of ['getCurrentApplication','getGuild']) await assert.rejects(client[method](),error=>error.code==='discord_unavailable' && !String(error).includes(token));
});

test('private threads require explicit membership except Discord moderators and never autojoin', async () => {
  const parentId='567890123456789012',botId='345678901234567890';
  for (const [permissions,membershipRequired] of [['66560',true],['8',false],[(66560n | 1n<<34n).toString(),false]]) {
    const requested=[];
    const client=createDiscordClient({config:readDiscordConfig(env),fetchImpl:async(url,options)=>{
      assert.equal(options.method,undefined,'client may not join a thread');const path=new URL(url).pathname;requested.push(path);
      if (path===`/api/v10/channels/${channelId}`) return Response.json({id:channelId,guild_id:guildId,type:12,parent_id:parentId});
      if (path===`/api/v10/channels/${parentId}`) return Response.json({id:parentId,guild_id:guildId,type:0,permission_overwrites:[]});
      if (path==='/api/v10/users/@me') return Response.json({id:botId});
      if (path.endsWith('/roles')) return Response.json([{id:guildId,permissions}]);
      if (path.endsWith(`/members/${botId}`)) return Response.json({roles:[]});
      if (path.endsWith('/thread-members/@me')) return Response.json({fixture:'denied'},{status:403});
      throw new Error('unexpected fixture request');
    }});
    if (membershipRequired) await assert.rejects(client.getChannel({channelId}),{code:'permission_denied'});
    else assert.equal((await client.getChannel({channelId})).id,channelId);
    assert.equal(requested.some(p=>p.endsWith('/thread-members/@me')),membershipRequired);
  }
});

test('preflight accepts both approved and limited Message Content flags with bounded probe and no writes', async () => {
  for (const bit of [18,19]) {
    const f = fixture(); f.app.flags = 1<<bit;
    const result = clean(await runDiscordPreflight(f));
    assert.equal(result.exitCode,0,JSON.stringify(result));
    assert.equal(f.messageReads.length,1); assert.equal(f.messageReads[0].limit,1); assert.equal(f.writes.length,0);
    assert(f.readChannels.includes(channelId));
  }
});

test('missing Message Content intent, storage, token and schema fail preflight', async () => {
  for (const kind of ['intent','storage','token','schema']) {
    const f = fixture();
    if (kind==='intent') f.app.flags=0;
    if (kind==='storage') f.store.configured=false;
    if (kind==='token') {f.env.DISCORD_BOT_TOKEN='';f.config=readDiscordConfig(f.env);}
    if (kind==='schema') f.store.listSyncChannels=async()=>({status:'unavailable',channels:[]});
    failed(await runDiscordPreflight(f)); assert.equal(f.writes.length,0,kind);
  }
});

test('preflight rejects wrong guild/channel and denied history before ingestion', async () => {
  for (const kind of ['guild','channel','permission']) {
    const f = fixture();
    if (kind==='guild') f.client.getGuild=async()=>({id:'999999999999999999'});
    if (kind==='channel') f.client.getChannel=async()=>({id:channelId,guild_id:'999999999999999999',type:0});
    if (kind==='permission') f.client.getChannel=async()=>{throw Object.assign(new Error(`${token} malicious-body`),{code:'permission_denied'});};
    failed(await runDiscordPreflight(f)); assert.equal(f.messageReads.length,0);
  }
});

test('explicit registration covers 2015 epoch and does not grant readers or expand threads', async () => {
  const f = fixture({channels:[]});
  const result=clean(await registerDiscordChannels(f)); assert.equal(result.exitCode,0,JSON.stringify(result));
  assert.equal(f.writes.length,1); assert.equal(new Date(f.writes[0].backfillFrom).toISOString(),fullHistory);
  assert.equal(f.writes[0].guildId,guildId); assert.equal(f.writes[0].channelId,channelId);
  assert.equal(f.messageReads.length,1); assert.equal(f.messageReads[0].limit,1); assert.deepEqual(f.readChannels,[channelId]);
  assert(!('allowedMemberIds' in f.writes[0])); assert(!('readerIds' in f.writes[0]));
});

test('registration requires provisioned admin and validates every channel before first write', async () => {
  for (const kind of ['admin','operator','scope']) {
    const f = fixture({channels:[],admin:kind!=='admin'});
    if (kind==='operator') f.env.DISCORD_OPERATOR_MEMBER_ID='not-a-provisioned-member';
    if (kind==='scope') {
      f.channelIds=[channelId,otherChannel];
      f.client.getChannel=async ({channelId:id})=>({id,guild_id:id===otherChannel?'999999999999999999':guildId,type:0,name:'Fixture'});
    }
    failed(await registerDiscordChannels(f)); assert.equal(f.writes.length,0,kind);
  }
});

test('registration rejects a cutoff earlier than the Discord epoch and a future cutoff', async () => {
  for (const from of ['2014-12-31T23:59:59Z','2027-01-01T00:00:00Z']) {
    const f=fixture({channels:[]}); failed(await registerDiscordChannels({...f,from})); assert.equal(f.writes.length,0);
  }
});

test('full-history backfill archives pre-2026 originals across bounded runs with atomic checkpoints', async () => {
  const messages=Array.from({length:220},(_,i)=>rawMessage(new Date(Date.parse('2016-01-01T00:00:00Z')+i*60000),i+1));
  const f=fixture({messages}); f.config={...f.config,maxPagesPerChannel:1};
  const result=clean(await runDiscordBackfill({...f,maxRuns:10}));
  assert.equal(result.exitCode,0,JSON.stringify(result)); assert.equal(f.rows.size,220);
  assert(f.messageReads.length>=3); assert.equal(f.states.get(sourceId).status,'succeeded');
  assert.equal(f.states.get(sourceId).before,null); assert.equal(f.states.get(sourceId).lastSuccessAt,instant.toISOString());
  assert([...f.rows.values()].every(m=>m.url===`https://discord.com/channels/${guildId}/${channelId}/${m.messageId}`));
});

test('backfill bound leaves resumable checkpoint and reports incomplete with nonzero exit', async () => {
  const f=fixture({messages:Array.from({length:220},(_,i)=>rawMessage(new Date(Date.parse('2016-01-01T00:00:00Z')+i*60000),i+1))});
  f.config={...f.config,maxPagesPerChannel:1};
  failed(await runDiscordBackfill({...f,maxRuns:1})); assert.equal(f.rows.size,100); assert.equal(f.states.get(sourceId).status,'running');
  assert.equal(f.states.get(sourceId).lastSuccessAt,null); assert(f.states.get(sourceId).before);
});

test('resuming an old fixed window must catch up to launch target before reporting completion', async () => {
  const old = rawMessage('2016-01-01T00:00:00Z'), fresh = rawMessage('2026-10-11T11:00:00Z');
  const f=fixture({messages:[old,fresh]});
  f.states.set(sourceId,{sourceId,status:'running',lastSuccessAt:null,windowFrom:fullHistory,windowTo:'2026-10-10T12:00:00.000Z',before:snowflakeBefore('2026-10-10T12:00:00Z')});
  const result=await runDiscordBackfill({...f,maxRuns:5});
  assert.equal(result.exitCode,0,JSON.stringify(result)); assert.equal(f.rows.size,2);
  assert(f.rows.has(fresh.id)); assert.equal(f.states.get(sourceId).lastSuccessAt,instant.toISOString());
  assert(result.runs>=2,'historical window success alone is not current catch-up');
});

test('the earliest valid Discord timestamp is included in full history', async () => {
  const first=rawMessage(fullHistory,1), f=fixture({messages:[first]});
  const result=await runDiscordBackfill({...f,maxRuns:2});
  assert.equal(result.exitCode,0,JSON.stringify(result)); assert.equal(f.rows.get(first.id).createdAt,fullHistory);
});

test('partial run abort keeps its checkpoint and never reports a successful handoff', async () => {
  const controller=new AbortController(), f=fixture({messages:Array.from({length:110},(_,i)=>rawMessage(new Date(Date.parse('2016-01-01T00:00:00Z')+i*60000),i+1))});
  f.config={...f.config,maxPagesPerChannel:1}; const persist=f.store.persistPage;
  f.store.persistPage=async args=>{const saved=await persist(args);controller.abort();return saved;};
  failed(await runDiscordBackfill({...f,signal:controller.signal,maxRuns:5}));
  assert.equal(f.rows.size,100); assert.equal(f.states.get(sourceId).status,'running'); assert.equal(f.states.get(sourceId).lastSuccessAt,null);
});

test('backfill stops on a stalled run and sanitized error without declaring success', async () => {
  for (const kind of ['stall','error']) {
    const f=fixture(); let runs=0;
    const runSync=async()=>{runs++;return kind==='stall'?{status:'partial',pages:0,messages:0,errors:[]}:{status:'partial',pages:0,messages:0,errors:[{code:`${token} malicious-body`}]};};
    failed(await runDiscordBackfill({...f,maxRuns:5,runSync})); assert(runs<=2,'stalled/error work must stop promptly');
  }
});

test('pre-aborted backfill performs no ingestion and missing config strict worker fails while generic worker remains no_op', async () => {
  const f=fixture(), controller=new AbortController();controller.abort();
  failed(await runDiscordBackfill({...f,signal:controller.signal})); assert.equal(f.messageReads.length,0);
  const absent={env:{},config:readDiscordConfig({}),store:{configured:false},client:{configured:false}};
  failed(await runDiscordOneShot(absent));
  assert.equal((await runDailyWorker({env:{},repository:{configured:false},discordConfig:absent.config,store:absent.store,client:absent.client})).status,'no_op');
});

test('strict worker rejects zero enabled channels and returns errors sanitized', async () => {
  failed(await runDiscordOneShot(fixture({channels:[]})));
  const f=fixture(); f.client.getChannel=async()=>{throw Object.assign(new Error(`${token} malicious-body`),{code:`${token} malicious-body`});};
  failed(await runDiscordOneShot(f));
});

test('launch stops remaining channels after first runtime permission or persistence failure', async () => {
  for (const kind of ['permission','persistence']) {
    const second={...channel,channelId:otherChannel,sourceId:'33333333-3333-4333-8333-333333333333'};
    const f=fixture({channels:[channel,second],messages:[rawMessage('2016-01-01T00:00:00Z')]});
    const getChannel=f.client.getChannel; let firstVisits=0;
    if (kind==='permission') f.client.getChannel=async args=>{
      if (args.channelId===channelId && ++firstVisits>1) throw Object.assign(new Error('fixture denied'),{code:'permission_denied'});
      return getChannel(args);
    };
    if (kind==='persistence') f.store.persistPage=async()=>({status:'unavailable'});
    failed(await runDiscordOneShot(f));
    assert.equal(f.messageReads.filter(r=>r.channelId===otherChannel).length,1,'second channel gets preflight probe only');
    assert.equal(f.rows.size,0); assert.equal(f.states.size,0);
  }
});

test('CLI parser bounds runs, deduplicates explicit channels, and rejects unrecognized secret flags', () => {
  const parsed=parseDiscordCliArgs(['register','--channel',channelId,'--channel',channelId]);
  assert.deepEqual(parsed.channelIds,[channelId]); assert.equal(parsed.from,fullHistory);
  assert.equal(parseDiscordCliArgs(['backfill','--max-runs','2']).maxRuns,2);
  for (const argv of [['register'],['backfill','--max-runs','0'],['backfill','--max-runs','10001'],['sync','--token',token],['register','--channel','all']]) {
    assert.throws(()=>parseDiscordCliArgs(argv),error=>!String(error).includes(token));
  }
});

test('CLI invalid command and strict missing configuration exit nonzero without exposing secret argv', async () => {
  for (const argv of [['unknown-command',token],['sync']]) {
    const result=await runDiscordCli({argv,env:{},config:readDiscordConfig({}),store:{configured:false},client:{configured:false}});
    failed(result);
  }
  assert.equal(typeof parseDiscordCliArgs,'function');
  const processResult=spawnSync(process.execPath,['server/discord/cli.js','sync'],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production'}});
  assert(processResult.status>0); assert(!processResult.stdout.includes(token)); assert(!processResult.stderr.includes(token));
  assert.doesNotThrow(()=>JSON.parse(processResult.stdout));
});

test('real CLI SIGTERM aborts an in-flight request and emits a sanitized nonzero result', {timeout:10000}, async () => {
  const child=spawn(process.execPath,['--import','./evidence/m17-discord-launch/signal-preload.mjs','server/discord/cli.js','sync'],{env:{PATH:process.env.PATH,NODE_ENV:'production',...env},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',sent=false;
  const guard=setTimeout(()=>child.kill('SIGKILL'),8000);
  child.stdout.on('data',data=>{stdout+=data;});
  child.stderr.on('data',data=>{stderr+=data;if (!sent && stderr.includes('fixture-request-started')) {sent=true;child.kill('SIGTERM');}});
  const [code,signal]=await new Promise((resolve,reject)=>{child.once('exit',(code,signal)=>resolve([code,signal]));child.once('error',reject);});
  clearTimeout(guard); assert(sent,'must reach fixture request before SIGTERM'); assert.equal(signal,null); assert.equal(code,1);
  const result=clean(JSON.parse(stdout)); assert.equal(result.status,'aborted'); assert.equal(result.exitCode,1);
  assert(!stderr.includes(token)); assert(!stderr.includes(serviceKey));
});

async function filesUnder(directory, prefix='') {
  const files=[];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const name=join(prefix,entry.name); assert(!entry.isSymbolicLink());
    if (entry.isDirectory()) files.push(...await filesUnder(join(directory,entry.name),name));
    else files.push(name);
  }
  return files.sort();
}

test('prepared deployment is isolated, uses strict worker entrypoint, and runs without repository files', async () => {
  const prepared=await prepareDiscordDeployment();
  try {
    const files=await filesUnder(prepared.directory);
    assert.equal(files.length,prepared.files);
    assert(files.includes('server/discord/cli.js')); assert(files.includes('Dockerfile')); assert(files.includes('package-lock.json'));
    assert(files.every(name=>['Dockerfile','package.json','package-lock.json','tools/check-api.mjs'].includes(name) || /^server\/.*\.js$/.test(name)));
    assert(!files.some(name=>/\.env|railway\.json|\.glb|^src\/|^evidence\/|^yuyang-site/.test(name)));
    const docker=await readFile(join(prepared.directory,'Dockerfile'),'utf8');
    assert.match(docker,/CMD \["node", "server\/discord\/cli\.js", "sync"\]/); assert.match(docker,/npm ci --omit=dev/); assert.match(docker,/USER node/);
    const result=spawnSync(process.execPath,['server/discord/cli.js','sync'],{cwd:prepared.directory,encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production'}});
    assert.equal(result.status,1); const output=JSON.parse(result.stdout); assert.equal(output.code,'not_configured');
  } finally {await rm(prepared.directory,{recursive:true,force:true});}
});

test('deployment input symlinks and backend symlinks are rejected before copy', async () => {
  const temporary=await mkdtemp(join(tmpdir(),'discord-launch-fixture-'));
  try {
    for (const kind of ['backend-file','package-file','backend-directory']) {
      const root=join(temporary,kind);
      for (const name of ['package.json','package-lock.json','tools/check-api.mjs','deployment/discord-worker/Dockerfile','server/index.js']) {
        await mkdir(dirname(join(root,name)),{recursive:true}); await writeFile(join(root,name),'fixture');
      }
      if (kind==='backend-file') await symlink(join(root,'package.json'),join(root,'server','secret.js'));
      if (kind==='package-file') {await rm(join(root,'package.json'));await symlink(join(root,'package-lock.json'),join(root,'package.json'));}
      if (kind==='backend-directory') {await rm(join(root,'server'),{recursive:true});await symlink(join(root,'tools'),join(root,'server'));}
      await assert.rejects(prepareDiscordDeployment({root,temporaryRoot:temporary}),/deployment_(?:symlink_denied|input_invalid)/);
    }
  } finally {await rm(temporary,{recursive:true,force:true});}
});

function policyFixture(options={}) {
  const f=fixture(options), calls=[];
  const policy={guildId,revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:['1461311169586266165','1533053124606955600','1203562092213305371','1203562092376891445'],excludedChannelIds:['1203562091982622819'],backfillFrom:fullHistory};
  f.store.getPolicy=async()=>({status:'ready',policy});
  f.store.configurePolicy=async args=>{calls.push({op:'configure',...args});Object.assign(policy,args.policy,{revision:policy.revision+1});return {status:'ready',policy};};
  f.store.resetArchive=async args=>{calls.push({op:'reset',...args});return {status:'ready',result:{deleted_messages:0}};};
  f.store.rebuildMemory=async args=>{calls.push({op:'memory',...args});return {status:'ready',result:{buckets:1,messages:f.rows.size}};};
  const runDiscovery=async()=>{calls.push({op:'discover'});return {status:'ready',complete:true};};
  return {...f,policy,calls,runDiscovery};
}

test('policy CLI preserves existing blacklist when exclusion flags are omitted and supports explicit policy setup',async()=>{
  const f=policyFixture();const categories=[...f.policy.excludedCategoryIds],channels=[...f.policy.excludedChannelIds];
  const result=await runDiscordCli({...f,argv:['policy','--paused','true']});assert.equal(result.exitCode,0,JSON.stringify(result));
  const write=f.calls.find(c=>c.op==='configure');assert.equal(write.expectedRevision,1);assert.equal(write.principal.id,memberId);
  assert.deepEqual(write.policy.excludedCategoryIds,categories);assert.deepEqual(write.policy.excludedChannelIds,channels);assert.equal(write.policy.paused,true);
  const fresh=policyFixture();fresh.store.getPolicy=async()=>({status:'not_configured',policy:null});
  assert.equal((await runDiscordCli({...fresh,argv:['policy','--exclude-category',categories[0],'--exclude-channel',channels[0]]})).exitCode,0);
  assert.equal(fresh.calls[0].expectedRevision,null);assert.deepEqual(fresh.calls[0].policy.excludedCategoryIds,[categories[0]]);
});

test('paused collection checks policy before any Discord call; explicit preflight cannot bypass current blacklist',async()=>{
  const f=policyFixture();f.policy.paused=true;
  f.client.getCurrentApplication=async()=>assert.fail('paused job may not authenticate/read Discord');
  failed(await runDiscordOneShot(f));assert.equal(f.calls.length,0);assert.equal(f.messageReads.length,0);
  const forbidden=policyFixture();forbidden.channelIds=['1203562091982622819'];
  failed(await runDiscordPreflight(forbidden));assert.equal(forbidden.messageReads.length,0);assert.equal(forbidden.readChannels.length,0);
});

test('incomplete discovery blocks collection; complete discovery and collection publish originals into memory',async()=>{
  const incomplete=policyFixture();incomplete.runDiscovery=async()=>({status:'partial',complete:false});
  failed(await runDiscordOneShot(incomplete));assert.equal(incomplete.messageReads.length,0);assert.equal(incomplete.rows.size,0);assert(!incomplete.calls.some(c=>c.op==='memory'));
  const ready=policyFixture({messages:[rawMessage('2016-01-01T00:00:00Z')]});
  const result=await runDiscordOneShot(ready);assert.equal(result.exitCode,0,JSON.stringify(result));
  assert.equal(ready.rows.size,1);assert.deepEqual(ready.calls.map(c=>c.op),['discover','memory']);
  assert.equal(ready.calls[1].guildId,guildId);assert.equal(ready.calls[1].expectedPolicyRevision,1);assert.equal(ready.calls[1].asOf,instant.toISOString());
});

test('automatic policy selection supports more than 100 channels while explicit user selection stays bounded',async()=>{
  const channels=Array.from({length:110},(_,i)=>({...channel,channelId:(BigInt(channelId)+BigInt(i)).toString(),sourceId:`22222222-2222-4222-8222-${(i+1).toString(16).padStart(12,'0')}`}));
  const f=policyFixture({channels});
  const result=await runDiscordPreflight({...f,channelIds:[]});assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.channels,110);assert.equal(f.messageReads.length,110);
  failed(await runDiscordPreflight({...f,channelIds:channels.map(c=>c.channelId)}));
});

test('management discover/classify/reset use explicit commands and reset requires the current paused admin policy',async()=>{
  const f=policyFixture();assert.equal((await runDiscordCli({...f,argv:['discover']})).exitCode,0);
  assert.equal((await runDiscordCli({...f,argv:['classify']})).exitCode,0);assert(f.calls.some(c=>c.op==='memory'));
  failed(await runDiscordCli({...f,argv:['reset']}));assert(!f.calls.some(c=>c.op==='reset'));
  f.policy.paused=true;const result=await runDiscordCli({...f,argv:['reset']});assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(f.calls.find(c=>c.op==='reset').expectedPolicyRevision,1);
  const noAdmin=policyFixture({admin:false});noAdmin.policy.paused=true;failed(await runDiscordCli({...noAdmin,argv:['reset']}));assert(!noAdmin.calls.some(c=>c.op==='reset'));
});
