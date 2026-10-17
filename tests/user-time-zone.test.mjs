import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalTimeZone,createTimeContext,resolveDateBoundary} from '../server/time-zone.js';
import {validateLiveDiscordArguments,createLiveRetrievalTools} from '../tools/discord/index.js';
import {createLiveChatTools} from '../tools/discord/live-summary.js';
import {createLiveDiscordRetrieval} from '../server/discord/live-retrieval.js';
import {discordSnowflakeAt} from '../server/discord/live-client.js';
const now='2026-10-15T01:00:00.000Z';
const cases=[
 ['America/New_York','2026-03-08','2026-03-08T05:00:00.000Z','2026-03-09','2026-03-09T04:00:00.000Z',23],
 ['America/New_York','2026-11-01','2026-11-01T04:00:00.000Z','2026-11-02','2026-11-02T05:00:00.000Z',25],
 ['America/Los_Angeles','2026-03-08','2026-03-08T08:00:00.000Z','2026-03-09','2026-03-09T07:00:00.000Z',23],
 ['Asia/Kolkata','2026-10-15','2026-10-14T18:30:00.000Z','2026-10-16','2026-10-15T18:30:00.000Z',24],
 ['Asia/Kathmandu','2026-10-15','2026-10-14T18:15:00.000Z','2026-10-16','2026-10-15T18:15:00.000Z',24],
 ['Australia/Lord_Howe','2026-04-05','2026-04-04T13:00:00.000Z','2026-04-06','2026-04-05T13:30:00.000Z',24.5],
 ['Australia/Lord_Howe','2026-10-04','2026-10-03T13:30:00.000Z','2026-10-05','2026-10-04T13:00:00.000Z',23.5],
 ['UTC','2026-10-15','2026-10-15T00:00:00.000Z','2026-10-16','2026-10-16T00:00:00.000Z',24],
];
test('IANA timezone validation defaults omitted legacy zone to UTC and rejects malformed/fixed-offset/type inputs',()=>{
 assert.equal(canonicalTimeZone(undefined),'UTC');assert.equal(canonicalTimeZone('US/Eastern'),'America/New_York');
 for(const value of [null,'','Invalid/Zone','+05:30','-0400','UTC+5','GMT-04:00',5,{},[],true]){assert.equal(canonicalTimeZone(value),null,JSON.stringify(value));assert.equal(createTimeContext({timeZone:value,now}),null);}
});
test('local date/clock derives from same UTC instant across western/eastern local date rollover',()=>{
 const la=createTimeContext({timeZone:'America/Los_Angeles',now}),east=createTimeContext({timeZone:'Asia/Kathmandu',now});assert.equal(la.now,now);assert.equal(east.now,now);assert.equal(la.localDate,'2026-10-14');assert.equal(east.localDate,'2026-10-15');assert(la.localDateTime.includes('18:00'));assert(east.localDateTime.includes('06:45'));
 assert.equal(resolveDateBoundary('today',la),'2026-10-14T07:00:00.000Z');assert.equal(resolveDateBoundary('yesterday',la),'2026-10-13T07:00:00.000Z');assert.equal(resolveDateBoundary('tomorrow',la),'2026-10-15T07:00:00.000Z');assert.equal(resolveDateBoundary('today',east),'2026-10-14T18:15:00.000Z');
});
for(const [timeZone,from,expectedFrom,to,expectedTo,hours]of cases)test(`calendar boundaries ${timeZone} ${from} yield ${hours}h with actual UTC endpoints`,()=>{
 const context=createTimeContext({timeZone,now});assert.equal(resolveDateBoundary(from,context),expectedFrom);assert.equal(resolveDateBoundary(to,context),expectedTo);assert.equal((Date.parse(expectedTo)-Date.parse(expectedFrom))/3600000,hours);
 const args=validateLiveDiscordArguments('read_discord_window',{channelId:'200',from,to},'100',context);assert(args);assert.equal(args.from,expectedFrom);assert.equal(args.to,expectedTo);
});
test('relative dates across DST use calendar days and explicit ISO offsets preserve their exact instants',()=>{
 const ctx=createTimeContext({timeZone:'America/New_York',now:'2026-11-01T12:00:00.000Z'});assert.equal(resolveDateBoundary('today',ctx),'2026-11-01T04:00:00.000Z');assert.equal(resolveDateBoundary('tomorrow',ctx),'2026-11-02T05:00:00.000Z');
 for(const timeZone of ['America/New_York','Asia/Kolkata','Australia/Lord_Howe']){const c=createTimeContext({timeZone,now});assert.equal(resolveDateBoundary('2026-10-15T00:00:00+05:45',c),'2026-10-14T18:15:00.000Z');assert.equal(resolveDateBoundary('2026-10-15T08:15:00.123-04:00',c),'2026-10-15T12:15:00.123Z');}
});
test('impossible or ambiguous dates, invalid explicit tool zones and reversed/equal ranges deny without guessing',()=>{
 const ctx=createTimeContext({timeZone:'America/New_York',now});for(const value of ['2026-02-29','2026-04-31','2026-13-01','2026-00-10','2026-10-00','2026-10-15T12:00','next friday','2026-02-30T12:00:00Z',null,100])assert.equal(resolveDateBoundary(value,ctx),null,String(value));
 for(const timeZone of [null,'','+05:30','Invalid/Zone',42])assert.equal(validateLiveDiscordArguments('read_discord_window',{channelId:'200',from:'2026-10-15',to:'2026-10-16',timeZone},'100',ctx),null);
 for(const to of ['2026-10-15','2026-10-14'])assert.equal(validateLiveDiscordArguments('read_discord_window',{channelId:'200',from:'2026-10-15',to},'100',ctx),null);
});
test('generic reads and RAM window interceptor share chat zone and explicit override without expanding channel scope',async()=>{
 const context=createTimeContext({timeZone:'Asia/Kathmandu',now}),calls=[],service={readWindow:async args=>{calls.push(args);return {status:'ready',sources:[],coverage:{complete:true}};},fetchWindow:async args=>{calls.push(args);return {status:'ready',sources:[],messages:[],coverage:{complete:true}};}};
 const generic=createLiveRetrievalTools({service,guildId:'100'}),ram=createLiveChatTools({service,guildId:'100',config:{configured:true},provider:{configured:true}}),principal={allowedSourceIds:['22222222-2222-4222-8222-222222222222'],liveDiscord:{mode:'local-operator',guildId:'100'}};
 for(const tools of [generic,ram])for(const explicit of [undefined,'America/Los_Angeles']){const args={channelId:'200',from:'2026-10-15',to:'2026-10-16',...(explicit?{timeZone:explicit}:{})};const result=await tools.execute({name:'read_discord_window',arguments:args,principal,timeContext:context});assert.equal(result.status,'ready');const call=calls.at(-1);assert.equal(call.from,explicit?'2026-10-15T07:00:00.000Z':'2026-10-14T18:15:00.000Z');assert.equal(call.to,explicit?'2026-10-16T07:00:00.000Z':'2026-10-15T18:15:00.000Z');assert.equal(call.channelId,'200');assert.deepEqual(call.principal,principal);assert.equal(result.coverage.from,call.from);assert.equal(result.coverage.to,call.to);assert.equal(result.coverage.timeZone,canonicalTimeZone(explicit||'Asia/Kathmandu'));}
});
test('real live service uses resolved half-open DST edges and bot cursor with no source/channel broadening',async()=>{
 const timeContext=createTimeContext({timeZone:'America/New_York',now:'2026-11-01T12:00:00Z'}),sourceId='22222222-2222-4222-8222-222222222222',from='2026-11-01T04:00:00.000Z',to='2026-11-02T05:00:00.000Z',reads=[];
 const message=t=>({id:discordSnowflakeAt(t),channel_id:'200',guild_id:'100',timestamp:t,author:{id:'400',username:'Fixture'},content:t});
 const policy={guildId:'100',revision:1,paused:false,excludedChannelIds:[],excludedCategoryIds:[]},store={getPolicy:async()=>({status:'ready',policy}),listSyncChannels:async()=>({status:'ready',channels:[{sourceId,channelId:'200',guildId:'100',enabled:true}]})};
 const metadata={id:'200',guild_id:'100',type:0,parent_id:null,name:'general'};let calls=0;const client={configured:true,getCurrentApplication:async()=>({flags:1<<18}),getGuildChannels:async()=>[metadata],getChannel:async()=>metadata,getMessages:async args=>{reads.push(args);return calls++?[]:[message('2026-11-02T04:59:59.999Z'),message(from),message('2026-11-01T03:59:59.999Z')];}};
 const service=createLiveDiscordRetrieval({config:{configured:true,guildId:'100'},store,client}),tools=createLiveRetrievalTools({service,guildId:'100'}),principal={allowedSourceIds:[sourceId],liveDiscord:{mode:'local-operator',guildId:'100'}};
 const r=await tools.execute({name:'read_discord_window',arguments:{channelId:'200',from:'today',to:'tomorrow'},principal,timeContext});assert.equal(r.status,'ready');assert.equal(r.coverage.complete,true);assert.equal(reads[0].before,discordSnowflakeAt(to));assert.equal(reads[0].channelId,'200');assert.deepEqual(r.sources.map(s=>s.createdAt),['2026-11-02T04:59:59.999Z',from]);assert.equal(r.coverage.from,from);assert.equal(r.coverage.to,to);assert.equal(r.coverage.timeZone,'America/New_York');
 const before=reads.length;const denied=await tools.execute({name:'read_discord_window',arguments:{channelId:'200',from:'today',to:'tomorrow',timeZone:'Asia/Kolkata'},principal:{...principal,allowedSourceIds:['33333333-3333-4333-8333-333333333333']},timeContext});assert.equal(denied.status,'channel_scope_denied');assert.equal(reads.length,before);
});
test('year/month/leap transitions and midnight gaps/overlaps resolve calendar dates without inventing skipped days',()=>{
 const year=createTimeContext({timeZone:'Asia/Kathmandu',now:'2026-12-31T22:00:00Z'});assert.equal(year.localDate,'2027-01-01');assert.equal(resolveDateBoundary('yesterday',year),'2026-12-30T18:15:00.000Z');assert.equal(resolveDateBoundary('today',year),'2026-12-31T18:15:00.000Z');assert.equal(resolveDateBoundary('tomorrow',year),'2027-01-01T18:15:00.000Z');
 const month=createTimeContext({timeZone:'America/Los_Angeles',now:'2026-03-01T04:00:00Z'});assert.equal(month.localDate,'2026-02-28');assert.equal(resolveDateBoundary('tomorrow',month),'2026-03-01T08:00:00.000Z');
 const leap=createTimeContext({timeZone:'Asia/Kolkata',now:'2024-02-29T12:00:00Z'});assert.equal(resolveDateBoundary('today',leap),'2024-02-28T18:30:00.000Z');assert.equal(resolveDateBoundary('tomorrow',leap),'2024-02-29T18:30:00.000Z');
 assert.equal(resolveDateBoundary('2018-11-04',{timeZone:'America/Sao_Paulo',now}),'2018-11-04T03:00:00.000Z');assert.equal(resolveDateBoundary('2026-11-01',{timeZone:'America/Havana',now}),'2026-11-01T04:00:00.000Z');assert.equal(resolveDateBoundary('2011-12-30',{timeZone:'Pacific/Apia',now}),null);
 assert.equal(canonicalTimeZone('America/'+'X'.repeat(101)),null);assert.equal(canonicalTimeZone(' America/New_York'),null);assert.equal(canonicalTimeZone('America/New_York '),null);
});
test('search normalizes date-only and relative ranges with same context and preserves precise author/channel filters',async()=>{
 const context=createTimeContext({timeZone:'America/New_York',now:'2026-03-08T12:00:00Z'}),calls=[],principal={allowedSourceIds:['22222222-2222-4222-8222-222222222222']},tools=createLiveRetrievalTools({guildId:'100',service:{search:async args=>{calls.push(args);return {status:'ready',sources:[],coverage:{complete:false,reason:'bounded_search'}};}}});
 const r=await tools.execute({name:'search_discord',arguments:{query:'workshop',channelIds:['200'],authorId:'400',from:'today',to:'tomorrow'},principal,timeContext:context});assert.equal(r.status,'ready');assert.equal(calls[0].from,'2026-03-08T05:00:00.000Z');assert.equal(calls[0].to,'2026-03-09T04:00:00.000Z');assert.deepEqual(calls[0].channelIds,['200']);assert.equal(calls[0].authorId,'400');assert.deepEqual(calls[0].principal,principal);assert.equal(r.coverage.timeZone,'America/New_York');assert.equal(r.coverage.complete,false);
 const before=calls.length;assert.equal((await tools.execute({name:'search_discord',arguments:{query:'a',from:'2026-02-30',to:'2026-03-01'},principal,timeContext:context})).status,'invalid_request');assert.equal(calls.length,before);
});
