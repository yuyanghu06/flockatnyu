import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveAssistantContext,assistantAnswerPrompt} from '../server/assistant-context.js';
const messages=[{role:'user',content:'Summarize #general last week'}];
const args={channelId:'200',from:'2026-10-01T04:00:00.000Z',to:'2026-10-08T04:00:00.000Z'};
const source=(id='m1',extra={})=>({id,title:'Evidence',url:'https://discord.com/channels/100/200/400',excerpt:'fact',...extra});
function harness(responses,{plans=[[{name:'read_discord_window',arguments:args}]],fallbackResult={status:'ready',sources:[source('summary',{tier:'weekly',periodStart:args.from,periodEnd:args.to})]}}={}) {
  let round=0,fallbackCalls=0;const order=[],prompts=[];
  const liveTools={tools:[{name:'search_discord'},{name:'read_discord_window'},{name:'read_discord_messages'},{name:'list_discord_channels'}],execute:async call=>{order.push(call.name);return typeof responses==='function'?responses(call):responses;}};
  const provider={planTools:async request=>{prompts.push(request.system);return plans[round++]||[];}};
  const fallback=async request=>{fallbackCalls++;order.push('fallback');assert(request.liveResults.length>0);return fallbackResult;};
  return {run:extras=>retrieveAssistantContext({messages,principal:{id:'fixture'},provider,liveTools,fallback,...extras}),calls:()=>fallbackCalls,order,prompts};
}
test('channel discovery followed by exact-window read happens in a second planning round',async()=>{
  const h=harness(call=>call.name==='list_discord_channels'?{status:'ready',channels:[{channelId:'200',name:'general'}],complete:true}:{status:'ready',sources:[source()],coverage:{complete:true,from:args.from,to:args.to}},{plans:[[{name:'list_discord_channels',arguments:{query:'general'}}],[{name:'read_discord_window',arguments:args}]]});
  const r=await h.run();assert.deepEqual(h.order,['list_discord_channels','read_discord_window']);assert.equal(h.calls(),0);assert(h.prompts[1].includes('general'));assert.equal(r.sources.length,1);
});

test('permission denial never authorizes fallback, including mixed earlier unavailability',async()=>{
  for(const status of ['forbidden','permission_denied','access_denied','channel_scope_denied']){const h=harness({status,sources:[],coverage:{complete:false}});const r=await h.run();assert.equal(h.calls(),0);assert.equal(r.status,'forbidden');}
  const h=harness(call=>({status:call.name==='search_discord'?'unavailable':'permission_denied',sources:[]}),{plans:[[{name:'search_discord',arguments:{query:'a'}}],[{name:'read_discord_window',arguments:args}]]});await h.run();assert.equal(h.calls(),0);
});
test('unavailable and partial live reads never call injected persisted fallback; prompts use only live evidence',async()=>{
 for(const status of ['discord_unavailable','unavailable','partial','rate_limited']){const h=harness({status,sources:[],coverage:{complete:false}});const r=await h.run();assert.deepEqual(h.order,['read_discord_window']);assert.equal(h.calls(),0);assert.deepEqual(r.sources,[]);const prompt=assistantAnswerPrompt(r);assert(prompt.includes('messages retrieved LIVE'));assert(!prompt.includes('stored summary'));assert(!prompt.includes('FALLBACK ONLY'));}
});


test('partial/truncated sources carry coverage warnings through context and answer prompt',async()=>{
  const h=harness({status:'ready',sources:[source('m1',{excerpt:'x'.repeat(3000)})],coverage:{complete:true,textTruncated:true,fetchedComplete:true,contentScope:'top_level_text_only'}});const r=await h.run();assert(r.results[0].coverage.textTruncated===true || r.results[0].coverage.complete===false || r.results[0].possiblyTruncated===true);assert(r.sources[0].excerpt.length<=1800);
});
test('orchestrator does not lose Google external ID or partial-content notice before read follow-up',async()=>{
  const seen=[];
  const provider={planTools:async({system})=>{seen.push(system);const data=JSON.parse(system.split('UNTRUSTED PREVIOUS TOOL RESULTS (JSON):\n')[1]);if(!data.length)return [{name:'search_drive',arguments:{query:'budget'}}];if(data.some(row=>row.tool==='read_drive'))return [];assert.equal(data[0].sources[0].externalId,'file_123');assert.equal(data[0].sources[0].contentStatus,'metadata_only');assert.equal(data[0].sources[0].partial,true);return [{name:'read_drive',arguments:{fileId:data[0].sources[0].externalId}}];}};
  const googleTools={tools:[{name:'search_drive'},{name:'read_drive'}],execute:async({name})=>({status:'ready',sources:[source('drive:file_123',{externalId:'file_123',contentStatus:name==='search_drive'?'metadata_only':'first_sheet_only',partial:true})]})};
  const r=await retrieveAssistantContext({messages,provider,googleTools});assert.equal(r.results.filter(v=>v.tool==='read_drive').length,1);assert.equal(seen.length,4);
});
test('catalogue truncation remains visible to model before it chooses a channel',async()=>{
  const h=harness({status:'ready',sources:[],channels:[{channelId:'200',name:'general'}],complete:false,reason:'channel_budget'},{plans:[[{name:'list_discord_channels',arguments:{}}],[]]});await h.run();assert(h.prompts[1].includes('channel_budget'));
});
test('arbitrary adapter credential fields and unsafe URLs never enter prompts; budgets cap source text',async()=>{
  const h=harness({status:'ready',sources:[source('bad',{url:'javascript:alert(1)'}),...Array.from({length:30},(_,i)=>source(String(i),{url:`https://example.com/${i}`,excerpt:'x'.repeat(5000),authorization:'fixture-secret'}))],coverage:{complete:true}});const r=await h.run();assert(r.sources.length<=12);assert(r.sources.every(s=>s.excerpt.length<=1800));assert(r.sources.reduce((n,s)=>n+s.excerpt.length,0)<=12000);assert(!assistantAnswerPrompt(r).includes('fixture-secret'));assert(!assistantAnswerPrompt(r).includes('javascript:'));
});
test('duplicate calls execute once and global planning/call limits bound pathological providers',async()=>{
  const call={name:'read_discord_window',arguments:args};const h=harness({status:'ready',sources:[],coverage:{complete:true}},{plans:[[call,call,call],[call]]});await h.run();assert.equal(h.order.length,1);
  const g=harness({status:'ready',sources:[],coverage:{complete:true}},{plans:[Array.from({length:10},(_,i)=>({name:'search_discord',arguments:{query:String(i)}})),Array.from({length:10},(_,i)=>({name:'search_discord',arguments:{query:String(i+20)}}))]});await g.run();assert.equal(g.order.length,4);
  const repeated=harness({status:'ready',sources:[],coverage:{complete:true}},{plans:Array.from({length:10},()=>[call])});await repeated.run();assert.equal(repeated.order.length,1);assert.equal(repeated.prompts.length,4,'two duplicate feedback/replans are allowed before the third consecutive stalled round stops');
  const alternating=harness({status:'ready',sources:[],coverage:{complete:true}},{plans:Array.from({length:40},(_,round)=>[{name:'search_discord',arguments:{query:`query-${Math.floor(round/2)}`}}])});await alternating.run();assert.equal(alternating.order.length,15);assert.equal(alternating.prompts.length,30,'progress resets stalls but never extends the global round cap');
  const unique=harness({status:'ready',sources:[],coverage:{complete:true}},{plans:Array.from({length:20},(_,round)=>[0,1].map(index=>({name:'search_discord',arguments:{query:`query-${round}-${index}`}})))});await unique.run();assert.equal(unique.order.length,30,'distinct proposals cannot exceed the global call cap');
});
test('cancelled tool retrieval does not continue to fallback',async()=>{
  const abort=new AbortController();const h=harness(()=>{abort.abort();return {status:'partial',sources:[]};});await assert.rejects(h.run({signal:abort.signal}),{name:'AbortError'});assert.equal(h.calls(),0);
});

test('combined context budget discloses partial evidence even when each separate tool result fits',async()=>{
  const h=harness(call=>({status:'ready',sources:Array.from({length:5},(_,i)=>source(`${call.arguments.channelId}-${i}`,{url:`https://example.com/${call.arguments.channelId}/${i}`,excerpt:'x'.repeat(1800)})),coverage:{complete:true}}),{plans:[[{name:'read_discord_window',arguments:args},{name:'read_discord_window',arguments:{...args,channelId:'201'}}]]});const r=await h.run();assert(r.sources.reduce((n,s)=>n+s.excerpt.length,0)<=12000);assert(r.results.some(result=>result.possiblyTruncated===true||result.coverage?.complete===false)||r.sources.some(s=>s.partial===true));
});
test('invalid requests cannot invoke fallback and exact Discord URLs retain normalized scope in tool results',async()=>{
 const invalid=harness({status:'invalid_request',sources:[],coverage:{complete:false}});await invalid.run();assert.equal(invalid.calls(),0);
 const url='https://discord.com/channels/100/200/400',h=harness({status:'discord_unavailable',sources:[]},{plans:[[{name:'read_discord_messages',arguments:{url}}]]});const r=await h.run();assert.equal(h.calls(),0);assert.equal(r.results[0].arguments.guildId,'100');assert.equal(r.results[0].arguments.channelId,'200');assert.equal(r.results[0].arguments.messageId,'400');assert.equal(r.results[0].arguments.url,url);
});
test('unread Discord nontext scope survives orchestration and is explicitly disclosed by the answer policy',async()=>{
  const h=harness({status:'ready',sources:[source()],coverage:{complete:true,contentScope:'top_level_text_only',nonTextMessageCount:3}});const r=await h.run();assert.equal(r.results[0].coverage.contentScope,'top_level_text_only');assert.equal(r.results[0].coverage.nonTextMessageCount,3);assert.match(assistantAnswerPrompt(r),/attachments, embeds, polls and component contents were not read/);
});
test('Google sender/recipient/date metadata survives final source normalization',async()=>{
  const metadata={from:'Member <member@example.com>',to:'club@example.com',date:'Thu, 15 Oct 2026 13:00:00 -0400'};let round=0;
  const r=await retrieveAssistantContext({messages,provider:{planTools:async()=>round++===0?[{name:'read_gmail',arguments:{messageId:'abc'}}]:[]},googleTools:{tools:[{name:'read_gmail'}],execute:async()=>({status:'ready',sources:[source('gmail:abc',metadata)]})}});for(const key of ['from','to','date'])assert.equal(r.sources[0][key],metadata[key]);
});
