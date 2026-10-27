// Inert transport/scheduler fixture: production app/runner, synthetic auth,
// controlled provider and tool adapters. No model API or business service I/O.
import assert from 'node:assert/strict';
import {createApp} from '../../server/runtime/app.js';
export const origin='http://steering.test';
export const principal={id:'synthetic-member',allowedSourceIds:['synthetic-source'],googleAccess:true};
export const conversation={messages:[{role:'user',content:'Save my first plan'}],buildingId:'stern',timeZone:'America/New_York',steering:true};
export const tool={name:'fixture_action',description:'Synthetic isolated operation',parameters:{type:'object',properties:{action:{type:'string'}},required:['action'],additionalProperties:false}};
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export async function until(check,label='condition',timeout=2500){const start=performance.now();while(!check()){if(performance.now()-start>timeout)throw Error(`Timed out waiting for ${label}`);await new Promise(resolve=>setTimeout(resolve,2));}}
export function createFixture({provider,execute=async()=>({status:'ready',sources:[]}),auditHook=async()=>{},mapTools,liveDiscordTools,attioTools,authPrincipal=principal}={}){
  const audit=[],dispatches=[],plans=[],contexts=[],streams=[];
  const wrapped={...provider,
    ...(provider?.toolTurn?{async toolTurn(input){plans.push(structuredClone({...input,signal:undefined}));return provider.toolTurn(input);}}:{}),
    stream(input){streams.push(input);return provider.stream(input);},
  };
  const adapter={tools:[tool],createRequest(context){contexts.push(context);return {tools:[tool],execute(input){dispatches.push(input);return execute(input);},updateUserContext(input){contexts.push(input);return true;}};}};
  const app=createApp({config:{configured:true,provider:'openai-compatible',timeoutMs:5000,requestTimeoutMs:5000,retrievalToolsEnabled:true},
    auth:c=>c.req.header('x-fixture-owner')==='revoked'?null:c.req.header('x-fixture-owner')==='other'?{...authPrincipal,id:'other'}:c.req.header('x-fixture-owner')==='scope-changed'?{...authPrincipal,allowedSourceIds:[]}:authPrincipal,
    audit:{async recordEvent(event){audit.push(event);await auditHook(event);}},provider:wrapped,mapTools:mapTools??adapter,liveDiscordTools,attioTools,
    now:()=>new Date('2026-10-23T21:00:00Z')});
  async function start(body=conversation){
    const abort=new AbortController(),response=await app.request(origin+'/api/chat',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body),signal:abort.signal});
    assert.equal(response.status,200);const records=[],reader=response.body.getReader();let pending='';
    const closed=(async()=>{const decoder=new TextDecoder();while(true){const chunk=await reader.read();pending+=decoder.decode(chunk.value,{stream:!chunk.done});let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);if(line)records.push(JSON.parse(line));}if(chunk.done)break;}})();
    await until(()=>records.some(event=>event.type==='run'),'initial run capability');
    const run=records.find(event=>event.type==='run');
    const steer=async(text,{messageId='queued-1',headers={},body,...options}={})=>{
      const response=await app.request(origin+`/api/chat/${options.runId??run.runId}/steer`,{method:'POST',headers:{'content-type':'application/json',origin,'x-flock-steering-token':run.steeringToken,...headers},body:JSON.stringify(body??{messageId,text})});
      return {status:response.status,body:await response.json()};
    };
    return {records,closed,run,steer,abort,cancel:()=>reader.cancel()};
  }
  return {app,start,audit,dispatches,plans,contexts,streams};
}
