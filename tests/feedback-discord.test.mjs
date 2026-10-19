import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveChatTools} from '../tools/discord/live-summary.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {DEFAULT_DISCORD_EXCLUSIONS} from '../server/discord/discovery.js';
import {EBOARD_CATEGORY_ID, LEADERSHIP_CHANNEL_ID, explicitlyRequestedTeam} from '../server/discord/channel-scope.js';
import {discordSnowflakeAt} from '../server/discord/live-client.js';
import {SUMMARY_FIELDS} from '../server/discord/summary-provider.js';

const guildId='100', channelId='200', otherTeam='201', leadershipThread='202';
const teamCategory='1203562092574277673', otherCategory='1203562092574277676';
const from='2026-10-12', to='2026-10-19';
const timeContext={now:'2026-10-19T16:00:00.000Z',timeZone:'America/New_York'};
const userMessage='when are tech treks meetings';
const channel=(id,name,parent_id=null,type=0)=>({id,name,parent_id,type,guild_id:guildId});
const channels=[channel(teamCategory,'tech-treks',null,4),channel(otherCategory,'marketing team',null,4),
  channel(EBOARD_CATEGORY_ID,'eboard',null,4),channel(channelId,'tech-treks-meetings',teamCategory),
  channel(otherTeam,'campaigns',otherCategory),channel(LEADERSHIP_CHANNEL_ID,'leadership-team',teamCategory),
  channel(leadershipThread,'leadership thread',LEADERSHIP_CHANNEL_ID,12)];
const metadata=new Map(channels.map(row=>[row.id,row]));
const configured={configured:true,maxInputBytes:49152,maxReduceLevels:16};
function realFixture({messages=[],getMessages,policy={},allowed,summaryConfigured=false,providerCost=.06,teamChannelName='tech-treks-meetings'}={}) {
  const fixtureChannels=channels.map(row=>row.id===channelId?{...row,name:teamChannelName}:row);
  const fixtureMetadata=new Map(fixtureChannels.map(row=>[row.id,row]));
  const catalogue=fixtureChannels.filter(row=>row.type!==4).map((row,index)=>({enabled:true,guildId,channelId:row.id,
    sourceId:`22222222-2222-4222-8222-${String(index+1).padStart(12,'0')}`}));
  const principal={liveDiscord:{mode:'local-operator',guildId},allowedSourceIds:allowed??catalogue.map(row=>row.sourceId)};
  const reads=[],reservations=[],dispatches=[];let catalogueCalls=0;
  const currentPolicy={guildId,revision:1,paused:false,...structuredClone(DEFAULT_DISCORD_EXCLUSIONS),...policy};
  const service=createLiveDiscordRetrieval({config:{configured:true,guildId},store:{
    getPolicy:async()=>({status:'ready',policy:currentPolicy}),listSyncChannels:async()=>({status:'ready',channels:catalogue})},
    client:{configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>fixtureChannels,
      getChannel:async({channelId})=>fixtureMetadata.get(channelId),getMessages:async args=>{
        reads.push(args);return getMessages?getMessages(args):args.before===discordSnowflakeAt('2026-10-19T04:00:00.000Z')?messages:[];
      }}});
  const provider={configured:summaryConfigured,async summarize(args){
    const reservation=await args.beforeDispatch({maxCostUsd:providerCost});reservations.push(reservation);
    if(reservation.status!=='ready')return reservation;
    dispatches.push(args);await args.afterDispatch({reservation,status:'succeeded'});
    return {status:'ready',summary:{...Object.fromEntries(SUMMARY_FIELDS.map(field=>[field,[]])),
      overview:[{text:'A supported meeting announcement.',messageIds:args.allowedMessageIds.slice(0,1)}]}};
  }};
  const wrapped={...service,getCatalogue:async args=>{catalogueCalls++;return service.getCatalogue(args);}};
  const tools=createLiveChatTools({service:wrapped,guildId,config:{...configured,configured:summaryConfigured},provider});
  return {tools,principal,reads,reservations,dispatches,catalogueCalls:()=>catalogueCalls,
    execute:(args={},extras={})=>tools.execute({name:'read_discord_summary',arguments:{scope:'team',channelId,from,to,...args},
      principal,userMessage,timeContext,...extras})};
}

test('when/where meeting questions authorize the named team without granting another team',()=>{
  for(const request of [userMessage,'Where are tech treks meetings?']) {
    assert.equal(explicitlyRequestedTeam(request,metadata.get(channelId),metadata),true);
    assert.equal(explicitlyRequestedTeam(request,metadata.get(otherTeam),metadata),false);
    const sibling=channel('333','tech-talks',otherCategory);
    assert.equal(explicitlyRequestedTeam(request,sibling,metadata),false);
  }
  for(const request of ["Don't check when tech treks meets",'When is marketing meeting?',
    'When does eboard discuss tech treks?', 'Where are eboard updates about tech treks?',
    'Skip tech treks. When is eboard meeting?', 'When are meetings?'])
    assert.equal(explicitlyRequestedTeam(request,metadata.get(channelId),metadata),false,request);
});

test('summary schema advertises bounded exact team channel selection',()=>{
  const tool=realFixture().tools.tools.find(row=>row.name==='read_discord_summary');
  assert.equal(tool.parameters.additionalProperties,false);
  assert.equal(tool.parameters.properties.channelId.type,'string');
  assert.equal(tool.parameters.properties.channelId.pattern,'^[0-9]{1,20}$');
  assert.match(tool.parameters.properties.channelId.description,/only with scope=team/);
});

test('natural team navigation resolves slugged and generic child names before an exact authorized summary',async()=>{
  for (const teamChannelName of ['tech-treks-meetings','meetings']) {
    const f=realFixture({teamChannelName});
    const options={principal:f.principal,userMessage,timeContext};
    const listed=await f.tools.execute({name:'list_discord_channels',arguments:{scope:'team',query:'Tech Treks'},...options});
    assert.equal(listed.status,'ready');assert.deepEqual(listed.channels.map(row=>row.channelId),[channelId]);
    assert.equal(f.reads.length,0);
    const summary=await f.tools.execute({name:'read_discord_summary',arguments:{scope:'team',channelId:listed.channels[0].channelId,from,to},...options});
    assert.equal(summary.status,'ready');assert(f.reads.length>0);assert(f.reads.every(row=>row.channelId===channelId));
    for (const request of ['When are meetings?', 'Do not read tech treks.','When is marketing meeting?']) {
      const denied=await f.tools.execute({name:'list_discord_channels',arguments:{scope:'team',query:'tech treks'},...options,userMessage:request});
      assert.deepEqual(denied.channels||[],[]);
    }
  }
});

test('fully named generic-subject teams stay opt-in without granting generic meeting questions',()=>{
  for (const subject of ['content','events','website']) {
    const category=channel(teamCategory,`${subject} team`,null,4);
    const child=channel(channelId,'meetings',teamCategory);
    const map=new Map([[category.id,category],[child.id,child]]);
    assert.equal(explicitlyRequestedTeam(`When does the ${subject} team meet?`,child,map),true);
    assert.equal(explicitlyRequestedTeam('When are meetings?',child,map),false);
    assert.equal(explicitlyRequestedTeam(`Do not read the ${subject} team.`,child,map),false);
    assert.equal(explicitlyRequestedTeam('When are tech treks meetings?',child,map),false);
  }
});

test('exact summary delegates one window with original request authorization, time and signal',async()=>{
  const calls=[],principal={id:'request-principal'},signal=new AbortController().signal;
  const expected={status:'partial',sources:[],coverage:{complete:false,reason:'fixture_failure'}};
  const tools=createLiveChatTools({guildId,config:{configured:false},provider:{configured:false},service:{
    getCatalogue(){throw Error('Exact channel must never scan a team catalogue');},async readWindow(args){calls.push(args);return expected;}}});
  const result=await tools.execute({name:'read_discord_summary',arguments:{scope:'team',channelId,from,to},
    principal,userMessage,timeContext,signal,budgetSignal:new AbortController().signal});
  assert.equal(calls.length,1);assert.equal(calls[0].channelId,channelId);
  assert.equal(calls[0].principal,principal);assert.equal(calls[0].signal,signal);assert.equal(calls[0].userMessage,userMessage);
  assert.equal(calls[0].timeContext.now,timeContext.now);assert.equal(calls[0].timeContext.timeZone,timeContext.timeZone);
  assert.equal(calls[0].from,'2026-10-12T04:00:00.000Z');assert.equal(calls[0].to,'2026-10-19T04:00:00.000Z');
  assert.equal(result.status,'partial');assert.equal(result.coverage.complete,false);assert.equal(result.coverage.reason,'fixture_failure');
});

test('malformed IDs, wrong scopes and unknown arguments fail before any service read',async()=>{
  for(const args of [{channelId:''},{channelId:'abc'},{channelId:'1'.repeat(21)},{channelId:200},{channelId:null},
    {scope:'eboard'},{scope:'general'},{scope:undefined},{scope:'all'},{userMessage:'Read all teams'},
    {from:'2026-02-31'},{from:to,to:from},{timeZone:'Invalid/Zone'}]) {
    const f=realFixture();const result=await f.execute(args);
    assert.equal(result.status,'invalid_request',JSON.stringify(args));assert.equal(f.reads.length,0);assert.equal(f.catalogueCalls(),0);
  }
});

test('exact meeting request reads only its selected authorized channel',async()=>{
  const f=realFixture();const result=await f.execute();
  assert.equal(result.status,'ready');assert.equal(result.coverage.complete,true);assert.deepEqual(result.sources,[]);
  assert.deepEqual(f.reads.map(row=>row.channelId),[channelId]);assert.equal(f.catalogueCalls(),0);
});

test('unknown IDs and all existing team/source/leadership exclusions reject before message reads',async()=>{
  for(const [args,extras,status,fixtureArgs] of [
    [{channelId:'999'},{},'channel_scope_denied'],
    [{channelId:otherTeam},{},'team_request_required'],
    [{},{userMessage:'When are eboard discussions about tech treks?'},'team_request_required'],
    [{},{userMessage:'Do not read tech treks. Summarize eboard only.'},'team_request_required'],
    [{},{userMessage:'When are marketing meetings?'},'team_request_required'],
    [{channelId:LEADERSHIP_CHANNEL_ID},{userMessage:'Read all teams including leadership.'},'channel_scope_denied'],
    [{channelId:leadershipThread},{userMessage:'Read all teams including leadership.'},'channel_scope_denied'],
    [{},{principal:{liveDiscord:{mode:'local-operator',guildId},allowedSourceIds:[]}},'forbidden'],
    [{},{},'channel_scope_denied',{policy:{excludedChannelIds:[channelId]}}],
    [{},{},'channel_scope_denied',{allowed:['22222222-2222-4222-8222-000000000002']}],
  ]) {
    const f=realFixture(fixtureArgs);const result=await f.execute(args,extras);
    assert.equal(result.status,status);assert.deepEqual(result.sources,[]);assert.equal(result.coverage.complete,false);
    assert.equal(f.reads.length,0);assert.equal(f.catalogueCalls(),0);
  }
});

test('empty successful exact window remains distinct from failed or cancelled reads',async()=>{
  const empty=await realFixture().execute();assert.equal(empty.status,'ready');assert.equal(empty.coverage.complete,true);
  const failed=realFixture({getMessages:()=>{throw Object.assign(Error('private failure'),{code:'permission_denied'});}});
  const result=await failed.execute();assert.equal(result.status,'permission_denied');assert.equal(result.coverage.complete,false);
  assert.deepEqual(result.sources,[]);assert(!JSON.stringify(result).includes('private failure'));
  const signal=new AbortController();signal.abort();const cancelled=realFixture();
  const aborted=await cancelled.execute({}, {signal:signal.signal});assert.equal(aborted.status,'aborted');
  assert.equal(aborted.coverage.complete,false);assert.equal(cancelled.reads.length,0);
});

test('exact summary preserves shared request budget across different signals and keeps every original',async()=>{
  const messages=Array.from({length:9},(_,i)=>({id:discordSnowflakeAt(new Date(Date.parse('2026-10-18T12:00:00.000Z')-i*1000).toISOString()),channel_id:channelId,guild_id:guildId,
    timestamp:'2026-10-18T12:00:00.000Z',content:`Meeting evidence ${i}`,author:{id:'400',username:'Member'}}));
  const f=realFixture({messages,summaryConfigured:true});const budgetSignal=new AbortController().signal;
  const first=await f.execute({}, {signal:new AbortController().signal,budgetSignal});
  assert.equal(first.status,'ready');assert.equal(first.coverage.directSummary,true);
  assert.equal(f.dispatches[0].input.length,messages.length);
  const second=await f.execute({}, {signal:new AbortController().signal,budgetSignal});
  assert.equal(second.status,'partial');assert.equal(second.coverage.complete,false);
  assert.equal(f.dispatches.length,1);assert.equal(f.reservations.at(-1).status,'budget_exhausted');
  assert.equal(f.catalogueCalls(),0);assert(f.reads.every(row=>row.channelId===channelId));
});


test('exact summary uses the same seven local dates and explicit timezone handling',async()=>{
  const calls=[];
  const tools=createLiveChatTools({guildId,config:{configured:false},provider:{configured:false},service:{
    async readWindow(args){calls.push(args);return {status:'ready',sources:[],coverage:{complete:true}};}}});
  const result=await tools.execute({name:'read_discord_summary',arguments:{scope:'team',channelId},
    principal:{},userMessage,timeContext:{now:'2026-11-02T02:00:00Z',timeZone:'America/New_York'}});
  assert.equal(result.coverage.from,'2026-10-26T04:00:00.000Z');assert.equal(result.coverage.to,'2026-11-02T02:00:00.000Z');
  await tools.execute({name:'read_discord_summary',arguments:{scope:'team',channelId,from,to,timeZone:'America/Los_Angeles'},
    principal:{},userMessage,timeContext});
  assert.equal(calls[1].from,'2026-10-12T07:00:00.000Z');assert.equal(calls[1].to,'2026-10-19T07:00:00.000Z');
});

test('cancelling during exact team message retrieval preserves incomplete coverage',async()=>{
  const controller=new AbortController();const f=realFixture({getMessages:()=>{controller.abort();throw new DOMException('Stopped','AbortError');}});
  const result=await f.execute({}, {signal:controller.signal});
  assert.equal(result.status,'aborted');assert.equal(result.coverage.complete,false);
  assert.equal(f.reads.length,1);assert.equal(f.dispatches.length,0);assert.equal(f.catalogueCalls(),0);
});
