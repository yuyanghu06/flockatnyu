import test from 'node:test';
import assert from 'node:assert/strict';
import {readMiroConfig,isMiroScheduleDue,parseBoardIds} from '../server/miro/config.js';
import {createMiroClient,miroErrorCode} from '../server/miro/client.js';
const config=overrides=>({...readMiroConfig({MIRO_SYNC_ENABLED:'true',MIRO_ACCESS_TOKEN:'SECRET_SENTINEL',MIRO_BOARD_IDS:'board1',MIRO_TEAM_ID:'team1'}),...overrides});
const board={id:'board1',modifiedAt:'2026-10-15T12:00:00Z',team:{id:'team1'}};
test('explicit scopes and 6AM New York gate across DST',()=>{
 assert.deepEqual(parseBoardIds('board1,https://miro.com/app/board/board2=/,board1'),['board1','board2=']);
 for(const value of ['https://evil.example/app/board/board1/','https://miro.com.evil/app/board/a','../x','https://miro.com/app/board/%2e%2e/'])assert.throws(()=>parseBoardIds(value));
 assert.equal(readMiroConfig({MIRO_ACCESS_TOKEN:'x'}).configured,false);
 for(const [date,expected] of [['2026-07-01T10:00:00Z',true],['2026-07-01T11:00:00Z',false],['2026-12-01T11:00:00Z',true],['2026-12-01T10:00:00Z',false]])assert.equal(isMiroScheduleDue(new Date(date)),expected,date);
});
test('fixed-origin GET, redirect denied, team checked, original card detail retained',async()=>{
 const seen=[];const card={id:'c1',type:'card',data:{title:'<b>Workshop</b>',description:'Room pending',dueDate:'2026-10-22'},geometry:{width:200},position:{x:12,y:34,origin:'center',relativeTo:'parent_top_left'},parent:{id:'frame1'},unknown:{retain:true}};
 const client=createMiroClient({config:config(),fetchImpl:async(url,opts)=>{seen.push({url,opts});return Response.json(url.endsWith('/cards/c1')?card:board);}});
 assert.deepEqual(await client.readBoard('board1'),board);assert.deepEqual(await client.readItem('board1','c1','card'),card);
 for(const {url,opts} of seen){assert.equal(new URL(url).origin,'https://api.miro.com');assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');}
 await assert.rejects(client.readBoard('not-allowed'),{code:'board_not_allowed'});
 const mismatch=createMiroClient({config:config(),fetchImpl:async()=>Response.json({...board,team:{id:'other'}})});await assert.rejects(mismatch.readBoard('board1'),{code:'team_mismatch'});
});
test('401/403/404 safely fail without response body or token leaking',async()=>{
 for(const [status,code] of [[401,'auth_required'],[403,'forbidden'],[404,'not_found']]){
  let calls=0;const client=createMiroClient({config:config(),fetchImpl:async()=>{calls++;return new Response('SECRET_SENTINEL RAW PRIVATE BODY',{status});}});
  await assert.rejects(client.readBoard('board1'),e=>e.code===code&&!String(e).includes('SECRET_SENTINEL'));assert.equal(calls,1);
 }
 assert.equal(miroErrorCode(new Error('SECRET_SENTINEL')),'unexpected_error');
});
test('429 retries bounded, respects retry-after, abort and request/byte/page limits',async()=>{
 let calls=0;const waits=[];const client=createMiroClient({config:config(),sleep:async ms=>waits.push(ms),fetchImpl:async()=>++calls===1?new Response('',{status:429,headers:{'retry-after':'2'}}):Response.json(board)});
 assert.deepEqual(await client.readBoard('board1'),board);assert.deepEqual(waits,[2000]);assert.equal(calls,2);
 const limited=createMiroClient({config:config({maxRetries:1}),sleep:async()=>{},fetchImpl:async()=>new Response('',{status:429})});await assert.rejects(limited.readBoard('board1'),{code:'rate_limit'});
 const controller=new AbortController();controller.abort();const aborted=createMiroClient({config:config(),signal:controller.signal,fetchImpl:()=>assert.fail('aborted request made')});await assert.rejects(aborted.readBoard('board1'),{code:'aborted'});
 for(const [override,method,code] of [[{maxBytes:10},'readBoard','byte_limit'],[{maxRequests:0},'readBoard','request_limit'],[{maxPages:0},'listItems','page_limit']]){const c=createMiroClient({config:config(override),fetchImpl:async()=>Response.json(board)});await assert.rejects(c[method]('board1'),{code});}
});
