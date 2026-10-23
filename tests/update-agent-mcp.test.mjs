import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAutomationAdapters} from '../server/automation/adapters.js';
import {readAutomationConfig} from '../server/automation/config.js';

const sourceId=randomUUID(),miroId=randomUUID();
function fixture({configured=false}={}) {
  const touched=[];
  const trap=new Proxy({}, {get(_target,key){touched.push(key);throw Error('Worker must never initialize or inspect Miro');}});
  const a=createAutomationAdapters({env:{ASSISTANT_ALLOWED_SOURCE_IDS:[sourceId,miroId].join(','),AGENT_GMAIL_SOURCE_ID:sourceId,MIRO_BOARD_IDS:'obsolete-board'},config:readAutomationConfig({AGENT_AUTOMATION_ENABLED:'true'}),fetchImpl:async()=>{throw Error('No network');},dependencies:{
    googleConfig:{configured:true},googleClient:{configured:true},calendarConfig:{configured:true,calendarId:'fixed'},calendarClient:{configured:true,calendarId:'fixed',preflight:async()=>({status:'ready',calendarId:'fixed',accessRole:'writer'})},
    discordConfig:{configured:false},discordTools:{tools:[]},miroConfig:configured?trap:{configured:false},miroStore:trap,miroClient:trap,miroTools:trap,
  }});
  return {a,touched};
}

test('worker construction and preparation never inspect Miro dependencies or register board grants',async()=>{
  const f=fixture({configured:true}),context={principal:f.a.principal};
  assert.equal((await f.a.prepareBatch(context)).status,'ready');
  assert.deepEqual(f.touched,[]);assert(!f.a.tools.some(tool=>/miro/i.test(tool.name)));
  assert(!f.a.principal.calendarSources.some(scope=>scope.boardId||scope.provider==='miro'));
  f.a.cleanupBatch();assert.deepEqual(f.touched,[]);
});

test('missing Miro configuration cannot block Calendar preparation or supply Miro write evidence',async()=>{
  const f=fixture(),context={principal:f.a.principal};await f.a.prepareBatch(context);
  const write=f.a.tools.find(tool=>tool.name==='upsert_calendar_event');assert(write);
  const result=await write.execute({sourceKey:'miro:obsolete-board:fake',sourceUrl:'https://miro.com/app/board/obsolete-board/?moveToWidget=fake',title:'Invented',start:{date:'2026-10-23'},end:{date:'2026-10-24'}},context);
  assert.equal(result.status,'forbidden_source');assert.deepEqual(f.touched,[]);
});
