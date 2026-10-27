import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,writeFile,mkdir,lstat,utimes,symlink,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTregCallLogger} from '../server/treg/call-log.js';
import {tregContactsFixture,tregQuery,tregPerson,tregRequestId} from './fixtures/treg-contacts.mjs';

async function temporary(t) {
  const directory=await mkdtemp(join(tmpdir(),'flock-treg-log-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return directory;
}
async function logs(directory) {
  const files=(await readdir(directory)).filter(name=>name.endsWith('.jsonl')).sort();
  return Promise.all(files.map(async name=>({name,text:await readFile(join(directory,name),'utf8'),events:(await readFile(join(directory,name),'utf8')).trim().split('\n').map(line=>JSON.parse(line))})));
}
const contains=(value,needle)=>JSON.stringify(value).includes(needle);
const resultBody=async f=>{const response=await f.request();return {code:response.status,result:await response.json()};};

test('Treg call logs durably preserve the complete successful lookup and import in private files',async t=>{
  const root=await temporary(t),directory=join(root,'calls');
  const fullResponse={results:[tregPerson],provider_output:{complete:'keep all output'},native_extra:{deep:{source:'entire raw provider response'}},costDollars:{total:0.007},requestId:'synthetic-native-request'};
  const f=tregContactsFixture({logDir:directory,upstream:fullResponse});
  f.mode.tregBefore=async()=>{
    const disk=await logs(directory);assert.equal(disk.length,1);assert.deepEqual(disk[0].events.map(event=>event.type),['request']);
    assert(contains(disk[0].events[0],tregQuery.q),'Request query is already on disk before the paid call');
  };
  f.mode.storageBefore=async()=>{
    const disk=await logs(directory);assert(disk[0].events.some(event=>event.type==='response'),'Response is durable before any contact persistence');
  };
  const {code,result}=await resultBody(f);assert.equal(code,200);assert.equal(result.imported,1);
  const disk=await logs(directory);assert.equal(disk.length,1);
  const events=disk[0].events;assert.deepEqual(events.map(event=>event.type),['request','response','import_outcome']);
  assert(events.every(event=>event.version===1&&event.logId&&Number.isFinite(Date.parse(event.at))));
  assert.deepEqual(events[0].data.body,f.tregRequests[0].body);assert.equal(events[0].data.endpoint,'https://treg.to/call/exa.people.search');assert.equal(events[0].data.body.category,'people');assert.equal(events[0].data.body.numResults,tregQuery.limit);assert(events[0].data.body.query.includes(tregQuery.q));
  const response=events.find(event=>event.type==='response');
  assert.deepEqual(response.data.body,fullResponse);assert.equal(response.data.httpStatus,200);assert.equal(response.data.truncated,false);
  assert.equal(response.data.bytesCaptured,Buffer.byteLength(JSON.stringify(fullResponse)));assert.equal(response.data.bytesObserved,response.data.bytesCaptured);
  assert(contains(response,'keep all output'));assert(contains(response,'entire raw provider response'));assert(contains(response,'costDollars'));
  assert(contains(response,'synthetic-call-1'));assert(contains(response,'1234'));
  const {logging,...savedResult}=result,{attempts,...loggedResult}=events.at(-1).data;assert.deepEqual(loggedResult,savedResult);assert.equal(logging.status,'ready');
  assert.deepEqual(attempts,[{inputIndex:0,requestedContactId:result.contacts[0].id,status:'confirmed',operation:'imported',confirmedContactId:result.contacts[0].id}]);assert(!Object.hasOwn(result,'attempts'));
  assert(!/synthetic-treg-secret|synthetic-database-secret|__Host-tech_session/.test(disk[0].text));
  assert.equal((await lstat(directory)).mode&0o777,0o700);assert.equal((await lstat(join(directory,disk[0].name))).mode&0o777,0o600);
});

test('Treg call logs retain rejected, malformed and oversized replies with honest bounded bodies',async t=>{
  const root=await temporary(t);
  const denied={error:'quota_problem',extra:{detail:'entire rejected body'},raw:{trace:['attempt one','attempt two']}};
  const f=tregContactsFixture({logDir:join(root,'denied'),upstreamStatus:429,upstream:denied});
  const failed=await resultBody(f);assert.equal(failed.result.status,'rate_limited');assert.equal(f.applied.length,0);
  const deniedLog=(await logs(f.logDir))[0];assert.deepEqual(deniedLog.events.map(event=>event.type),['request','response','lookup_outcome','import_outcome']);
  assert.deepEqual(deniedLog.events[1].data.body,denied);assert.equal(deniedLog.events[1].data.httpStatus,429);
  assert(contains(deniedLog.events[1],'entire rejected body'));assert(contains(deniedLog.events[1],'attempt two'));assert(contains(deniedLog.events[1],'429'));
  const {logging,...failureResult}=failed.result,{attempts,...loggedFailure}=deniedLog.events.at(-1).data;assert.deepEqual(loggedFailure,failureResult);assert.deepEqual(attempts,[]);assert.equal(logging.status,'ready');
  const malformed=tregContactsFixture({logDir:join(root,'malformed')});
  malformed.mode.tregResponse=()=>new Response('NOT JSON — preserve this raw text',{status:200});
  await malformed.request();const malformedLog=(await logs(malformed.logDir))[0];assert.equal(malformedLog.events[1].data.rawText,'NOT JSON — preserve this raw text');assert.equal(malformed.applied.length,0);
  const oversized=tregContactsFixture({logDir:join(root,'oversized')});
  oversized.mode.tregResponse=()=>new Response('a'.repeat(512000)+'OUTSIDE-BOUNDED-PREFIX',{status:200});
  const tooLarge=await resultBody(oversized);assert.equal(tooLarge.result.status,'response_too_large');assert.equal(oversized.applied.length,0);
  const largeLog=(await logs(oversized.logDir))[0];assert(!largeLog.text.includes('OUTSIDE-BOUNDED-PREFIX'));assert.equal(largeLog.events[1].complete,false);assert.equal(largeLog.events[1].data.truncated,true);assert.equal(largeLog.events[1].data.bytesCaptured,512000);assert(largeLog.events[1].data.bytesObserved>512000);assert.equal(largeLog.events[1].data.rawText.length,512000);assert(largeLog.text.length<550000);
  const readFailure=tregContactsFixture({logDir:join(root,'read-failure')});
  readFailure.mode.tregResponse=()=>{let sent=false;return new Response(new ReadableStream({pull(controller){if(!sent){sent=true;controller.enqueue(new TextEncoder().encode('partial body before read failure'));}else controller.error(Error('PRIVATE stream diagnostic'));}}),{status:200});};
  const readFailed=await resultBody(readFailure);assert.equal(readFailed.result.status,'unavailable');assert.equal(readFailure.applied.length,0);
  const readEvent=(await logs(readFailure.logDir))[0].events[1];assert.equal(readEvent.complete,false);assert.equal(readEvent.data.rawText,'partial body before read failure');assert.equal(readEvent.data.error,'response_read_failed');
});

test('Treg call logs redact secret keys and known secret values throughout structured and raw text data',async t=>{
  const root=await temporary(t),secret='synthetic-treg-secret',databaseSecret='synthetic-database-secret';
  const full={results:[tregPerson],raw:{Authorization:'Bearer arbitrary-unlisted-value',access_token:'unlisted-access-token',nested:[{api_key:'unlisted-api-key',notes:`reflected ${secret} and ${databaseSecret}`}],safe:'keep this safe value'},_treg:{served_by:'exa.people.search',tried:[]}};
  const f=tregContactsFixture({logDir:join(root,'structured'),upstream:full});
  const response=await f.request({body:{query:{...tregQuery,q:`Find ${secret}`},requestId:tregRequestId}});assert.equal(response.status,200);
  const disk=(await logs(f.logDir))[0];
  for(const sensitive of [secret,databaseSecret,'arbitrary-unlisted-value','unlisted-access-token','unlisted-api-key'])assert(!disk.text.includes(sensitive),sensitive);
  assert(disk.text.includes('keep this safe value'));assert(disk.text.includes('reflected'));assert.equal(disk.events[0].redacted,true);assert.equal(disk.events[1].redacted,true);
  const malformed=tregContactsFixture({logDir:join(root,'raw')});
  malformed.mode.tregResponse=()=>new Response(`failure token=${secret}; Authorization: Bearer raw-unlisted-value\n{"api_key":"raw-json-api-secret"} private=${databaseSecret}\nhttps://raw-user:raw-url-password@example.test/resource\nBearer standalone-unlisted-token\nCookie: session=raw-cookie-secret`,{status:500});
  await malformed.request();const raw=(await logs(malformed.logDir))[0].text;
  for(const sensitive of [secret,databaseSecret,'raw-unlisted-value','raw-json-api-secret','raw-user','raw-url-password','standalone-unlisted-token','raw-cookie-secret'])assert(!raw.includes(sensitive),sensitive);
  assert(raw.includes('failure'));
  let deep={leaf:secret};for(let index=0;index<80;index++)deep={nested:deep};
  const deepFixture=tregContactsFixture({logDir:join(root,'deep'),upstream:{results:[tregPerson],raw:{deep},_treg:{served_by:'exa.people.search'}}});
  const deepResult=await resultBody(deepFixture);assert.equal(deepResult.result.imported,1);assert.deepEqual(deepFixture.state[0].raw_input,tregPerson);
  const deepLog=(await logs(deepFixture.logDir))[0],deepEvent=deepLog.events[1];assert.equal(deepEvent.complete,false);assert.equal(deepEvent.redaction.depthLimited,true);assert(deepLog.text.includes('[DEPTH LIMIT]'));assert(!deepLog.text.includes(secret));
});

test('Treg logging failures stop paid calls or writes at the right boundary and preserve confirmed saves',async t=>{
  const root=await temporary(t);
  const missing=tregContactsFixture({logDir:join(root,'missing'),callLogger:{begin:async()=>({status:'log_unavailable'})}});
  const pre=await resultBody(missing);assert.equal(pre.result.status,'log_unavailable');assert.equal(missing.tregRequests.length,0);assert.equal(missing.applied.length,0);
  function failAt(type,directory) {
    const real=createTregCallLogger({directory,env:{TREG_TOKEN:'synthetic-treg-secret'}});
    return {begin:async request=>{
      const begun=await real.begin(request);if(begun.status!=='ready')return begun;
      return {...begun,session:{...begun.session,append:async(kind,data)=>kind===type?{status:'log_unavailable'}:begun.session.append(kind,data)}};
    }};
  }
  const response=tregContactsFixture({logDir:join(root,'response'),callLogger:failAt('response',join(root,'response'))});
  const blocked=await resultBody(response);assert.equal(blocked.result.status,'log_unavailable');assert.equal(blocked.result.logging.status,'log_unavailable','Later successful final append cannot erase earlier missing response');assert.equal(response.tregRequests.length,1);assert.equal(response.applied.length,0);assert.equal(response.storageRequests.length,0);
  const lookup=tregContactsFixture({logDir:join(root,'lookup'),upstreamStatus:500,callLogger:failAt('lookup_outcome',join(root,'lookup'))});
  const failedLookup=await resultBody(lookup);assert.equal(failedLookup.result.logging.status,'log_unavailable');assert.equal(lookup.applied.length,0);
  const final=tregContactsFixture({logDir:join(root,'final'),callLogger:failAt('import_outcome',join(root,'final'))});
  const saved=await resultBody(final);assert.equal(saved.result.imported,1);assert.equal(saved.result.contacts.length,1);assert.equal(final.applied.length,1);assert.equal(saved.result.logging.status,'log_unavailable');assert(saved.result.logging.logId);
  assert.equal(final.storageRequests.filter(request=>request.method==='POST'&&new URL(request.url).pathname==='/rest/v1/contacts').length,1);
  const uncertain=tregContactsFixture({logDir:join(root,'uncertain'),storageFailure:'after'}),unknown=await resultBody(uncertain);
  const unknownLog=(await logs(uncertain.logDir))[0],outcome=unknownLog.events.at(-1).data;
  assert.equal(unknown.result.reason,'write_outcome_unknown');assert.equal(unknown.result.imported,0);assert.equal(uncertain.applied.length,1);
  assert.deepEqual(outcome.attempts,[{inputIndex:0,requestedContactId:uncertain.applied[0].id,status:'failed',reason:'write_outcome_unknown',uncertain:true}]);assert(!Object.hasOwn(unknown.result,'attempts'));
});

test('Treg logs distinguish transport failure and cancellation without recording exception contents',async t=>{
  const root=await temporary(t);
  const thrown=tregContactsFixture({logDir:join(root,'transport')});thrown.mode.tregThrow=true;
  const failed=await resultBody(thrown);assert.equal(failed.result.status,'unavailable');assert.equal(thrown.applied.length,0);
  const failure=(await logs(thrown.logDir))[0];assert(failure.events.some(event=>event.type==='lookup_outcome'));
  assert(failure.events.some(event=>event.type==='import_outcome'));assert(!failure.text.includes('PRIVATE upstream response'));
  assert(!failure.text.includes('synthetic-treg-secret'));
  const cancelled=tregContactsFixture({logDir:join(root,'aborted')}),controller=new AbortController();
  cancelled.mode.tregBefore=()=>{controller.abort();throw new DOMException('PRIVATE cancellation diagnostic','AbortError');};
  const response=await cancelled.request({signal:controller.signal}),result=await response.json();
  assert.equal(result.status,'aborted');assert.equal(cancelled.applied.length,0);
  const abortLog=(await logs(cancelled.logDir))[0];assert(contains(abortLog.events,'aborted'));assert(!abortLog.text.includes('PRIVATE cancellation diagnostic'));
});

test('Treg call-log retention removes only expired own files and refuses symlinked log paths',async t=>{
  const root=await temporary(t),directory=join(root,'calls');
  const old=createTregCallLogger({directory,now:()=>new Date('2026-10-18T12:00:00Z')});
  const first=await old.begin({query:tregQuery});assert.equal(first.status,'ready');
  const oldFile=(await logs(directory))[0].name;await utimes(join(directory,oldFile),new Date('2026-10-18T12:00:00Z'),new Date('2026-10-18T12:00:00Z'));
  const unrelated=join(directory,'unrelated.jsonl');await writeFile(unrelated,'keep unrelated data');await utimes(unrelated,new Date('2026-10-18T12:00:00Z'),new Date('2026-10-18T12:00:00Z'));
  await Promise.all(Array.from({length:1005},(_,index)=>writeFile(join(directory,`000000000-unrelated-${index}.txt`),'keep')));
  const fresh=createTregCallLogger({directory,now:()=>new Date('2026-10-26T12:00:00Z')});
  for(let pass=0;pass<3;pass++)assert.equal((await fresh.begin({query:tregQuery})).status,'ready');
  await fresh.close?.();
  assert(!(await readdir(directory)).includes(oldFile));assert.equal(await readFile(unrelated,'utf8'),'keep unrelated data');
  const target=join(root,'target');await mkdir(target);const linked=join(root,'linked');await symlink(target,linked);
  assert.equal((await createTregCallLogger({directory:linked}).begin({query:tregQuery})).status,'log_unavailable');assert.deepEqual(await readdir(target),[]);
  const fileLogger=createTregCallLogger({directory:join(root,'file-test')});const call=await fileLogger.begin({query:tregQuery});assert.equal(call.status,'ready');
  const file=(await readdir(join(root,'file-test')))[0],external=join(root,'external');await writeFile(external,'keep external bytes');
  await unlink(join(root,'file-test',file));await symlink(external,join(root,'file-test',file));
  assert.equal((await call.session.append('response',{safe:'new'})).status,'log_unavailable');assert.equal(await readFile(external,'utf8'),'keep external bytes');
});
