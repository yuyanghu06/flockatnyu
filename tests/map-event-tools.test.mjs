import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapTools,MAP_TOOLS} from '../tools/map/index.js';
import {MAP_RECORD_EXAMPLES} from '../server/map/contracts.js';
import {checkSchema} from '../server/automation/validation.js';
const principal={id:'fixture',allowedSourceIds:[MAP_RECORD_EXAMPLES.event.source_id]};
const args=()=>structuredClone({event:MAP_RECORD_EXAMPLES.event,buildings:MAP_RECORD_EXAMPLES.buildings,people:MAP_RECORD_EXAMPLES.people});
test('shared map tools have valid schemas and exact read/write classification',()=>{
 assert.deepEqual(MAP_TOOLS.map(t=>t.name),['read_map_events','lookup_map_person','upsert_map_event']);
 for(const tool of MAP_TOOLS)assert(checkSchema(tool.parameters));
 assert.equal(MAP_TOOLS[0].readOnly,true);assert.equal(MAP_TOOLS[1].readOnly,true);assert.equal(MAP_TOOLS[2].idempotent,true);
});
test('dispatch forwards trusted principal/signal and normalizes only successful statuses',async()=>{
 const calls=[],controller=new AbortController();
 const service={configured:true,read:async a=>{calls.push(a);return {status:'ok',events:[]};},lookup:async a=>{calls.push(a);return {status:'ok',person:null};},upsert:async a=>{calls.push(a);return {status:'applied',event_id:'event',updated_at:'version'};}};
 const tools=createMapTools({service});
 assert.equal((await tools.execute({name:'read_map_events',arguments:{},principal,signal:controller.signal})).status,'ready');
 assert.equal((await tools.execute({name:'lookup_map_person',arguments:{provider:'discord',providerUserId:'123',sourceId:principal.allowedSourceIds[0],sourceUrl:MAP_RECORD_EXAMPLES.event.source_url},principal})).person,null);
 const result=await tools.execute({name:'upsert_map_event',arguments:args(),principal});assert.equal(result.status,'ready');assert.equal(result.sourceStatus,'applied');assert.equal(calls[0].principal,principal);assert.equal(calls[0].signal,controller.signal);
 service.upsert=async()=>({status:'conflict'});assert.deepEqual(await tools.execute({name:'upsert_map_event',arguments:args(),principal}),{status:'conflict'});
});
test('schema and principal checks reject forged controls, name identity and legacy writes before service',async()=>{
 let calls=0;const tools=createMapTools({service:{configured:true,read:async()=>{calls++;},lookup:async()=>{calls++;},upsert:async()=>{calls++;}}});
 for(const request of [{name:'lookup_map_person',arguments:{name:'Yuyang'}},{name:'upsert_map_event',arguments:{...args(),sql:'delete'}},{name:'upsert_map_event',arguments:{...args(),event:{...args().event,created_at:'now'}}},{name:'read_map_events',arguments:{principal}},{name:'set_people_here',arguments:{}}])assert.equal((await tools.execute({...request,principal})).status,'invalid_request');
 assert.equal((await tools.execute({name:'read_map_events',arguments:{},principal:{id:'fake'}})).status,'forbidden');assert.equal(calls,0);
});
test('classification tools read the full catalogue and require a known type without exposing catalogue mutations',async()=>{
 const event_types=['study','meeting','event','social','other'].map(code=>({code,name:code,description:'',icon_key:code,sort_order:10}));let writes=0;
 const tools=createMapTools({service:{configured:true,read:async()=>({status:'ok',events:[],event_types}),upsert:async()=>{writes++;return {status:'applied'};}}});
 assert.deepEqual((await tools.execute({name:'read_map_events',arguments:{eventId:'00000000-0000-0000-0000-000000000099'},principal})).event_types,event_types);
 const missing=args();delete missing.event.type_id;
 for(const arguments_ of [missing,{...args(),event:{...args().event,type_id:'workshop'}}])assert.equal((await tools.execute({name:'upsert_map_event',arguments:arguments_,principal})).status,'invalid_request');
 assert.equal((await tools.execute({name:'upsert_event_type',arguments:{code:'new'},principal})).status,'invalid_request');assert.equal(writes,0);
});
test('service errors are sanitized and unconfigured tools fail closed',async()=>{
 assert.equal((await createMapTools().execute({name:'read_map_events',arguments:{},principal})).status,'not_configured');
 const tools=createMapTools({service:{configured:true,read:async()=>{throw Error('private secret');}}});assert.deepEqual(await tools.execute({name:'read_map_events',arguments:{},principal}),{status:'unavailable'});
});
