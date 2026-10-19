import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {readDiscordConfig} from '../server/discord/config.js';
import {createDiscordClient} from '../server/discord/client.js';
import {parseDiscordCliArgs, runDiscordPreflight, registerDiscordChannels, runDiscordCli, runDiscordManagement} from '../server/discord/cli.js';

const guildId = '123456789012345678', channelId = '234567890123456789', otherChannel = '234567890123456790';
const memberId = '11111111-1111-4111-8111-111111111111', sourceId = '22222222-2222-4222-8222-222222222222';
const token = 'fixture-bot-token-DO-NOT-PRINT', serviceKey = 'fixture-role-key-DO-NOT-PRINT';
const env = {DISCORD_BOT_TOKEN:token,DISCORD_GUILD_ID:guildId,SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:serviceKey,DISCORD_OPERATOR_MEMBER_ID:memberId};
const fullHistory = '2015-01-01T00:00:00.000Z';
const instant = new Date('2026-10-11T12:00:00.000Z');
const channel = {sourceId,channelId,guildId,title:'Events',enabled:true};
function fixture({messages = [], channels = [channel], admin = true} = {}) {
  const writes = [], readChannels = [], messageReads = [];
  const app = {id:'456789012345678901',flags:1 << 18};
  const client = {configured:true,
    async getCurrentApplication() {return app;},
    async getGuild() {return {id:guildId,name:'Fixture guild'};},
    async getChannel({channelId:id}) {readChannels.push(id); return {id,guild_id:guildId,type:0,name:'Fixture channel'};},
    async getMessages(args) {messageReads.push(args); return messages.filter(m => m.channel_id === args.channelId && (args.before == null || BigInt(m.id)<BigInt(args.before))).sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1).slice(0,args.limit);},
  };
  const store = {configured:true,
    async listSyncChannels() {return {status:'ready',channels};},
    async listChannels({principal}) {return admin && principal?.isAdmin === true ? {status:'ready',channels} : {status:'forbidden',channels:[]};},
    async configureChannel({principal,channel:entry}) {
      if (!admin || principal?.isAdmin !== true) return {status:'forbidden'};
      writes.push(structuredClone(entry)); const saved = {...entry,sourceId}; channels.push(saved); return {status:'ready',channel:saved};
    },
  };
  return {env:{...env},config:readDiscordConfig(env),store,client,channelIds:[channelId],now:()=>instant,app,writes,readChannels,messageReads,messages};
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

test('preflight rejects wrong guild/channel and denied history before message reads', async () => {
  for (const kind of ['guild','channel','permission']) {
    const f = fixture();
    if (kind==='guild') f.client.getGuild=async()=>({id:'999999999999999999'});
    if (kind==='channel') f.client.getChannel=async()=>({id:channelId,guild_id:'999999999999999999',type:0});
    if (kind==='permission') f.client.getChannel=async()=>{throw Object.assign(new Error(`${token} malicious-body`),{code:'permission_denied'});};
    failed(await runDiscordPreflight(f)); assert.equal(f.messageReads.length,0);
  }
});

test('explicit registration preserves source scope and does not grant readers or expand threads', async () => {
  const f = fixture({channels:[]});
  const result=clean(await registerDiscordChannels(f)); assert.equal(result.exitCode,0,JSON.stringify(result));
  assert.equal(f.writes.length,1); assert(!Object.hasOwn(f.writes[0],'backfillFrom'));
  assert.equal(f.writes[0].guildId,guildId); assert.equal(f.writes[0].channelId,channelId);
  assert.equal(f.messageReads.length,1); assert.equal(f.messageReads[0].limit,1); assert.deepEqual(f.readChannels,[channelId]);
  assert(!('allowedMemberIds' in f.writes[0])); assert(!('readerIds' in f.writes[0]));
});

test('registration requires trusted backend admin/storage and validates every channel before first write', async () => {
  for (const kind of ['admin','storage','scope']) {
    const f = fixture({channels:[],admin:kind!=='admin'});
    if (kind==='storage') f.store.configured=false;
    if (kind==='scope') {
      f.channelIds=[channelId,otherChannel];
      f.client.getChannel=async ({channelId:id})=>({id,guild_id:id===otherChannel?'999999999999999999':guildId,type:0,name:'Fixture'});
    }
    failed(await registerDiscordChannels(f)); assert.equal(f.writes.length,0,kind);
  }
});

test('trusted server registration needs no operator member environment variable',async()=>{
 for(const value of [undefined,'not-a-member']){const f=fixture({channels:[]});if(value===undefined)delete f.env.DISCORD_OPERATOR_MEMBER_ID;else f.env.DISCORD_OPERATOR_MEMBER_ID=value;const result=await registerDiscordChannels(f);assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(f.writes.length,1);}
});


test('removed archive commands and flags fail before inspecting dependencies',async()=>{
 const forbidden=new Proxy({},{get(){assert.fail('removed command inspected a dependency');}});
 for(const argv of [['backfill'],['sync'],['reset'],['classify'],['register','--channel',channelId,'--from',fullHistory],['policy','--from',fullHistory]]){const result=await runDiscordCli({argv,config:forbidden,store:forbidden,client:forbidden});assert.equal(result.status,'failed');assert.equal(result.code,'invalid_request');assert.equal(result.exitCode,1);}
});

test('CLI parser bounds runs, deduplicates explicit channels, and rejects unrecognized secret flags', () => {
  const parsed=parseDiscordCliArgs(['register','--channel',channelId,'--channel',channelId]);
  assert.deepEqual(parsed.channelIds,[channelId]);
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
  const child=spawn(process.execPath,['--import','./tests/fixtures/discord-cli-signal-preload.mjs','server/discord/cli.js','preflight'],{env:{PATH:process.env.PATH,NODE_ENV:'production',...env},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',sent=false;
  const guard=setTimeout(()=>child.kill('SIGKILL'),8000);
  child.stdout.on('data',data=>{stdout+=data;});
  child.stderr.on('data',data=>{stderr+=data;if (!sent && stderr.includes('fixture-request-started')) {sent=true;child.kill('SIGTERM');}});
  const [code,signal]=await new Promise((resolve,reject)=>{child.once('exit',(code,signal)=>resolve([code,signal]));child.once('error',reject);});
  clearTimeout(guard); assert(sent,'must reach fixture request before SIGTERM'); assert.equal(signal,null); assert.equal(code,1);
  const result=clean(JSON.parse(stdout)); assert.equal(result.status,'aborted'); assert.equal(result.exitCode,1);
  assert(!stderr.includes(token)); assert(!stderr.includes(serviceKey));
});

function policyFixture(options={}) {
  const f=fixture(options), calls=[];
  const policy={guildId,revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:['1461311169586266165','1533053124606955600','1203562092213305371','1203562092376891445'],excludedChannelIds:['1203562091982622819']};
  f.store.getPolicy=async()=>({status:'ready',policy});
  f.store.configurePolicy=async args=>{calls.push({op:'configure',...args});Object.assign(policy,args.policy,{revision:policy.revision+1});return {status:'ready',policy};};
  const runDiscovery=async()=>{calls.push({op:'discover'});return {status:'ready',complete:true};};
  return {...f,policy,calls,runDiscovery};
}

test('policy CLI preserves existing blacklist when exclusion flags are omitted and supports explicit policy setup',async()=>{
  const f=policyFixture();const categories=[...f.policy.excludedCategoryIds],channels=[...f.policy.excludedChannelIds];
  const result=await runDiscordCli({...f,argv:['policy','--paused','true']});assert.equal(result.exitCode,0,JSON.stringify(result));
  const write=f.calls.find(c=>c.op==='configure');assert.equal(write.expectedRevision,1);assert.equal(write.principal.id,'server-operator');
  assert.deepEqual(write.policy.excludedCategoryIds,categories);assert.deepEqual(write.policy.excludedChannelIds,channels);assert.equal(write.policy.paused,true);
  const fresh=policyFixture();fresh.store.getPolicy=async()=>({status:'not_configured',policy:null});
  assert.equal((await runDiscordCli({...fresh,argv:['policy','--exclude-category',categories[0],'--exclude-channel',channels[0]]})).exitCode,0);
  assert.equal(fresh.calls[0].expectedRevision,null);assert.deepEqual(fresh.calls[0].policy.excludedCategoryIds,[categories[0]]);
});

test('paused preflight checks policy before any Discord call; explicit preflight cannot bypass current blacklist',async()=>{
  const f=policyFixture();f.policy.paused=true;
  f.client.getCurrentApplication=async()=>assert.fail('paused job may not authenticate/read Discord');
  failed(await runDiscordPreflight(f));assert.equal(f.calls.length,0);assert.equal(f.messageReads.length,0);
  const forbidden=policyFixture();forbidden.channelIds=['1203562091982622819'];
  failed(await runDiscordPreflight(forbidden));assert.equal(forbidden.messageReads.length,0);assert.equal(forbidden.readChannels.length,0);
});

test('automatic policy selection supports more than 100 channels while explicit user selection stays bounded',async()=>{
  const channels=Array.from({length:110},(_,i)=>({...channel,channelId:(BigInt(channelId)+BigInt(i)).toString(),sourceId:`22222222-2222-4222-8222-${(i+1).toString(16).padStart(12,'0')}`}));
  const f=policyFixture({channels});
  const result=await runDiscordPreflight({...f,channelIds:[]});assert.equal(result.exitCode,0,JSON.stringify(result));assert.equal(result.channels,110);assert.equal(f.messageReads.length,110);
  failed(await runDiscordPreflight({...f,channelIds:channels.map(c=>c.channelId)}));
});

test('management retains discovery while removed archive commands stay unavailable',async()=>{
 const f=policyFixture();assert.equal((await runDiscordCli({...f,argv:['discover']})).exitCode,0);assert.deepEqual(f.calls.map(c=>c.op),['discover']);
 for(const paused of [false,true])for(const command of ['classify','reset']){f.policy.paused=paused;const result=await runDiscordCli({...f,argv:[command]});assert.equal(result.status,'failed');assert.equal(result.code,'invalid_request');assert.equal(result.exitCode,1);}
 assert.deepEqual(f.calls.map(c=>c.op),['discover']);
});

test('explicit discovery completes metadata without reading or persisting original messages',async()=>{
  const metadata={id:channelId,guild_id:guildId,type:5,parent_id:null,name:'Announcements'},saved=[];
  const policy={guildId,revision:1,paused:false,discoveryEnabled:true,excludedCategoryIds:[],excludedChannelIds:[]};
  const noRaw=()=>assert.fail('metadata worker must never read or persist original messages');
  const client={configured:true,
    getGuildChannels:async()=>[metadata],getActiveThreads:async()=>({threads:[]}),
    getChannel:async()=>({...metadata,botPermissions:'66560'}),
    getArchivedThreads:async()=>({threads:[],hasMore:false}),getMessages:noRaw,getMessage:noRaw,
  };
  const store={configured:true,
    getPolicy:async()=>({status:'ready',policy}),getDiscoveryState:async()=>({status:'empty',state:null}),
    persistDiscovery:async args=>{saved.push(structuredClone(args));return {status:'ready'};},
    completeDiscovery:async args=>{assert.equal(args.state.phase,'complete');return {status:'ready'};},
    persistPage:noRaw,getSyncState:noRaw,listEmbeddingWork:noRaw,saveEmbedding:noRaw,rebuildMemory:noRaw,
  };
  const result=clean(await runDiscordManagement({env,config:readDiscordConfig(env),store,client,command:'discover'}));
  assert.equal(result.status,'ready',JSON.stringify(result));assert.equal(result.complete,true);assert.equal(result.exitCode,0);
  assert(saved.some(write=>write.channels.some(row=>row.channelId===channelId&&row.eligible)),'eligible channel metadata is persisted');
  assert(saved.every(write=>!Object.hasOwn(write,'messages')&&!Object.hasOwn(write,'payload')));
});
