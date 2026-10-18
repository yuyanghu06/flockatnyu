import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDiscordMetadataRefresh} from '../server/discord/metadata-refresh.js';

function fixture({phase='archives',steps=[],onWait,signal,wait,policyPatch={}}={}) {
 const config={guildId:'100',metadataRefreshMs:3600000},generation=randomUUID();
 let state={generation,policyRevision:4,phase,taskIndex:175,tasks:Array(191).fill(null)},policy={guildId:'100',revision:4,paused:false,discoveryEnabled:true,excludedChannelIds:['leadership'],...policyPatch};
 const calls=[],waits=[];
 const fixedCatalogue=Object.freeze([{enabled:false,manual_disabled:true},{enabled:false,leadership:true}]);
 const store={getPolicy:async()=>({status:'ready',policy:structuredClone(policy)}),getDiscoveryState:async()=>({status:'ready',state:structuredClone(state)})};
 const discover=async options=>{calls.push(options);const step=steps[calls.length-1];if(typeof step==='function')return step(control,options);if(step==='complete'){state={...state,phase:'complete',taskIndex:191};return {status:'ready',complete:true,generation:state.generation,channels:0};}return {status:'partial',code:'budget_exhausted',generation:state.generation,channels:0};};
 const control={calls,waits,config,generation,catalogue:fixedCatalogue,get state(){return state;},get policy(){return policy;},setState:next=>{state={...state,...next};},setPolicy:next=>{policy={...policy,...next};}};
 const options={config,store,client:{fixture:true},signal,discover,...(wait?{wait}: {wait:async(ms,value,options)=>{waits.push(ms);await onWait?.(control,options);}})};
 return {...control,manager:createDiscordMetadataRefresh(options),control};
}
test('partial generation continues after short backoff, publishes only via discovery completion, then hourly',async()=>{
 const f=fixture({steps:[undefined,'complete']});const before=structuredClone(f.catalogue);
 assert.equal(await f.manager.initialDelayMs(),5000);const result=await f.manager.refresh();assert.deepEqual(result,{status:'ready',complete:true,channels:0});assert.equal(f.calls.length,2);assert.deepEqual(f.waits,[5000]);assert(f.calls.every(call=>call.config===f.config));assert.equal(f.manager.nextDelayMs,3600000);assert.equal(await f.manager.initialDelayMs(),3600000);assert.deepEqual(f.catalogue,before);
});
test('internal slice deadline resumes same generation while caller remains live',async()=>{
 for(const status of ['aborted','partial']){
  const f=fixture({steps:[c=>({status,code:'aborted',generation:c.generation}),'complete']});assert.equal((await f.manager.refresh()).complete,true);assert.equal(f.calls.length,2);assert.deepEqual(f.waits,[5000]);
 }
});
test('three incomplete slices are bounded and schedule another short invocation rather than one hour',async()=>{
 const f=fixture();await assert.rejects(f.manager.refresh(),{message:'metadata_refresh_pending'});assert.equal(f.calls.length,3);assert.deepEqual(f.waits,[5000,5000]);assert.equal(f.manager.nextDelayMs,5000);
 f.control.setState({phase:'complete'});assert.equal(await f.manager.initialDelayMs(),3600000);
});
test('caller cancellation interrupts actual backoff without another slice or completion',async()=>{
 const controller=new AbortController(),f=fixture({signal:controller.signal,wait:(await import('node:timers/promises')).setTimeout});
 const work=f.manager.refresh();setTimeout(()=>controller.abort(),10);await assert.rejects(work,{message:'metadata_refresh_failed'});assert.equal(f.calls.length,1);assert.equal(f.manager.nextDelayMs,60000);
 const aborted=fixture({signal:AbortSignal.abort()});await assert.rejects(aborted.manager.refresh());assert.equal(aborted.calls.length,0);
});
test('revision changes, paused policy and foreign generation fail closed before continuation',async()=>{
 for(const change of [c=>c.setPolicy({revision:5}),c=>c.setPolicy({paused:true}),c=>c.setPolicy({discoveryEnabled:false}),c=>c.setState({generation:randomUUID()}),c=>c.setState({policyRevision:5})]){
  const f=fixture({onWait:change});await assert.rejects(f.manager.refresh(),{message:'metadata_refresh_failed'});assert.equal(f.calls.length,1);assert.equal(f.manager.nextDelayMs,60000);
 }
 const paused=fixture({policyPatch:{paused:true}});await assert.rejects(paused.manager.refresh());assert.equal(paused.calls.length,0);
 const foreignResult=fixture({steps:[()=>({status:'partial',code:'budget_exhausted',generation:randomUUID()})]});await assert.rejects(foreignResult.manager.refresh());assert.equal(foreignResult.calls.length,1);
});
test('same generation completed by another actor during backoff is reused without fresh discovery',async()=>{
 const f=fixture({onWait:c=>c.setState({phase:'complete',taskIndex:191})});assert.equal((await f.manager.refresh()).complete,true);assert.equal(f.calls.length,1);assert.equal(f.manager.nextDelayMs,3600000);
});
test('terminal failures do not internally retry and never expose upstream errors',async()=>{
 for(const step of [c=>({status:'failed',code:'permission_denied',generation:c.generation}),c=>({status:'aborted',code:'permission_denied',generation:c.generation}),()=>{throw Error('PRIVATE_PROVIDER_TEXT');}]){
  const f=fixture({steps:[step]});await assert.rejects(f.manager.refresh(),error=>error.message==='metadata_refresh_failed'&&!String(error).includes('PRIVATE'));assert.equal(f.calls.length,1);assert.equal(f.waits.length,0);assert.equal(f.manager.nextDelayMs,60000);
 }
});
test('simultaneous callers share one bounded refresh promise and restart cleanly afterwards',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const f=fixture({steps:[async c=>{await gate;c.setState({phase:'complete',taskIndex:191});return {status:'ready',complete:true,generation:c.generation,channels:0};}]});
 const one=f.manager.refresh(),two=f.manager.refresh();assert.equal(one,two);release();assert.equal((await one).complete,true);assert.equal((await two).complete,true);assert.equal(f.calls.length,1);
});
test('fresh periodic discovery must actually publish its generation before completion is reported',async()=>{
 const f=fixture({phase:'complete',steps:[c=>({status:'partial',code:'budget_exhausted',generation:randomUUID()})]});assert.equal(await f.manager.initialDelayMs(),3600000);await assert.rejects(f.manager.refresh());assert.equal(f.calls.length,1);
});
