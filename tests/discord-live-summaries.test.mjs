import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkLiveSummaryEvidence} from '../server/discord/live-summary-utils.js';
import {liveSummaryMapInputs,packLiveSummaryInputs,summarizeLiveDiscordEvidence} from '../server/discord/live-summary-runner.js';
import {readDiscordLiveSummaryConfig} from '../server/discord/live-summary-config.js';
import {canonicalDiscordSummaryJson,SUMMARY_FIELDS} from '../server/discord/summary-provider.js';
const cfg=readDiscordLiveSummaryConfig({DISCORD_BOT_TOKEN:'fixture',DISCORD_GUILD_ID:'100',LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'fixture'});
const empty=()=>Object.fromEntries(SUMMARY_FIELDS.map(key=>[key,[]]));
const summary=ids=>({...empty(),overview:ids.length?[{text:'Supported fixture',messageIds:ids.slice(0,12)}]:[]});

test('live summary configuration ignores archive schedule and embedding credentials',()=>{
 assert.equal(cfg.configured,true);
 const stale=readDiscordLiveSummaryConfig({DISCORD_BOT_TOKEN:'fixture',DISCORD_GUILD_ID:'100',LLM_PROVIDER:'openai-compatible',LLM_MODEL:'gpt-6-luna',LLM_API_KEY:'fixture',SUMMARY_EMBEDDING_API_KEY:'stale',DISCORD_SUMMARY_MAX_GROUPS:'500',DISCORD_BACKFILL_FROM:'invalid'});
 assert.deepEqual(stale,cfg);
 for(const key of ['embedding','maxGroups','leaseSeconds','maxPagesPerPeriod','maxMessagesPerPeriod','maxRunCostUsd'])assert(!Object.hasOwn(stale,key));
});

test('large Unicode evidence reconstructs the full record without cutting code points',()=>{
 const evidence={messageId:'1500000000000000000',content:'😀'.repeat(20000)+'END_SENTINEL'};
 const chunks=chunkLiveSummaryEvidence(evidence),fragments=liveSummaryMapInputs([evidence]);
 assert(chunks.length>10);assert.equal(chunks.join(''),canonicalDiscordSummaryJson(evidence));
 assert(chunks.every(chunk=>Buffer.byteLength(chunk)<=6000&&!chunk.includes('\ufffd')));
 assert.equal(fragments.map(part=>part.evidenceJsonFragment).join(''),canonicalDiscordSummaryJson(evidence));
 assert(fragments.every(part=>part.messageId===evidence.messageId));
 assert.throws(()=>chunkLiveSummaryEvidence(evidence,3));
});

test('map/reduce consumes every input and preserves only supported original citations',async()=>{
 const messages=Array.from({length:30},(_,index)=>({messageId:String(1500000000000000000n+BigInt(index)),content:'x'.repeat(3000)})),seen=[];
 const provider={async summarize(args){seen.push(args);return {status:'ready',summary:summary(args.allowedMessageIds)};}};
 const result=await summarizeLiveDiscordEvidence({messages,config:cfg,provider,store:{}});
 assert.equal(result.status,'ready');assert.equal(seen.filter(call=>call.stage==='map').flatMap(call=>call.input).length,messages.length);assert(seen.some(call=>call.stage==='reduce'));
 const ids=new Set(messages.map(message=>message.messageId));assert(result.summary.overview.every(finding=>finding.messageIds.every(id=>ids.has(id))));
 await assert.rejects(summarizeLiveDiscordEvidence({messages,config:cfg,provider:{summarize:async()=>({status:'ready',summary:summary(['999'])})},store:{}}),{code:'foreign_citation'});
});

test('input and reduction limits fail closed; empty requests dispatch no model call',async()=>{
 assert.throws(()=>packLiveSummaryInputs([{messageId:'1',content:'x'.repeat(100)}],10),{code:'coverage_limit'});
 const provider={summarize:async()=>assert.fail('empty evidence dispatched')};
 assert.deepEqual((await summarizeLiveDiscordEvidence({messages:[],config:cfg,provider})).summary,empty());
 const messages=Array.from({length:20},(_,index)=>({messageId:String(index+1),content:'x'.repeat(3000)}));
 await assert.rejects(summarizeLiveDiscordEvidence({messages,config:{...cfg,maxReduceLevels:0},provider:{summarize:async args=>({status:'ready',summary:summary(args.allowedMessageIds)})},store:{}}),{code:'coverage_failed'});
 const controller=new AbortController();controller.abort();await assert.rejects(summarizeLiveDiscordEvidence({messages,config:cfg,provider,store:{},signal:controller.signal}),{code:'aborted'});
});
