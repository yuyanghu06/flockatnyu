import assert from 'node:assert/strict';
import {createApp} from '../../server/runtime/app.js';
import {createContactsStore} from '../../server/contacts/store.js';
import {contactFields} from '../../server/contacts/fields.js';
import {readConfig} from '../../server/shared/config.js';
import {createSiteAuth,readSiteAuthConfig} from '../../server/auth/site-auth.js';
import {createTregPeopleClient,createTregContactsImporter} from '../../server/treg/people.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const temporaryRoots=new Set();
process.once('exit',()=>{for(const directory of temporaryRoots)rmSync(directory,{recursive:true,force:true});});

export const tregRequestId='51000000-0000-4000-8000-000000000001';
export const tregQuery={q:'Engineering leaders at Example Labs',limit:5};
export const tregPerson={id:'synthetic-person-1',first_name:'Rae',last_name:'Example',email:'rae@example.com',phone_number:'+1 001 555 0100',organization:{name:'Example Labs'},profile_url:'https://www.linkedin.com/in/rae-example',private_extra:{original:'retain this provider data'}};
export const tregStamp='2026-10-26T20:00:00.123456+00:00';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
const decodeLiteral=value=>value?.replace(/^"|"$/g,'').replace(/\\(.)/g,'$1');

// Only external HTTP transport and PostgREST persistence are simulated. The
// production route, Treg request/normalization/importer and contacts store run.
export function tregContactsFixture({rows=[],people=[tregPerson],provider='exa.people.search',upstream,upstreamStatus=200,upstreamHeaders={},token='synthetic-treg-secret',tregEnv={},storageFailure,storageFailureAt=1,production=true,auth,callLogger,logDir}={}) {
  const temporaryRoot=mkdtempSync(join(tmpdir(),'flock-treg-fixture-'));temporaryRoots.add(temporaryRoot);
  logDir??=join(temporaryRoot,'calls');
  let state=structuredClone(rows),postCount=0,discordCalls=0;
  const tregRequests=[],storageRequests=[],applied=[],audit=[];
  const mode={};
  const fetchImpl=async(input,init={})=>{
    const url=new URL(input),method=init.method||'GET',body=init.body?JSON.parse(init.body):undefined;
    const request={url:url.toString(),method,body:structuredClone(body),headers:new Headers(init.headers),signal:init.signal};
    if(init.signal?.aborted)throw new DOMException('Aborted','AbortError');
    if(url.origin==='https://treg.to') {
      assert.equal(url.pathname,'/call/exa.people.search');
      tregRequests.push(request);
      if(mode.tregBefore)await mode.tregBefore(request);
      if(mode.tregThrow)throw Error('PRIVATE upstream response synthetic-treg-secret rae@example.com');
      if(mode.tregResponse)return mode.tregResponse();
      return json(upstream??{results:structuredClone(people),private_extra:{original:'raw source response'}},upstreamStatus,
        {'X-Treg-Call-Id':'synthetic-call-1','X-Treg-Cost-Micro':'1234','X-Treg-Served-By':'exa.people.search',...upstreamHeaders});
    }
    assert.equal(url.origin,'https://treg-contacts-storage.example.test','No business service or inference calls are allowed');
    assert(['/rest/v1/contacts','/rest/v1/rpc/contacts_match_email'].includes(url.pathname));
    storageRequests.push(request);
    if(mode.storageBefore)await mode.storageBefore(request);
    const emailMatch=url.pathname==='/rest/v1/rpc/contacts_match_email';
    if((method==='GET'||emailMatch)&&mode.storageReadResponse)return mode.storageReadResponse(request);
    if(emailMatch){
      assert.equal(method,'POST');assert.deepEqual(Object.keys(body),['p_email']);
      if(mode.storageReadThrow)throw Error('PRIVATE database transport details');
      return json(state.filter(row=>contactFields(row).email.toLowerCase()===body.p_email.toLowerCase()).slice(0,2));
    }
    const valueOf=(row,key)=>key==='raw_input->>email'?row.raw_input.email:key==='raw_input->>phone_number'?row.raw_input.phone_number:row[key];
    let found=state.filter(row=>[...url.searchParams].every(([key,filter])=>{
      if(['select','limit','offset','order','on_conflict'].includes(key))return true;
      if(key==='or') {
        const match=/^\(raw_input->>email\.ilike\."((?:\\.|[^"\\])*)"\)$/.exec(filter);
        assert(match,'Fixture accepts only one quoted literal exact-email condition');
        return String(row.raw_input.email).toLowerCase()===decodeLiteral(match[1]).toLowerCase();
      }
      if(filter.startsWith('eq.'))return String(valueOf(row,key))===decodeLiteral(filter.slice(3));
      if(filter.startsWith('ilike.'))return String(valueOf(row,key)).toLowerCase()===decodeLiteral(filter.slice(6)).toLowerCase();
      throw Error(`Fixture does not implement PostgREST filter ${key}`);
    }));
    if(method==='GET') {
      if(mode.storageReadThrow)throw Error('PRIVATE database transport details');
      return json(found.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('limit')||found.length)));
    }
    assert.equal(method,'POST','Import must not update or delete saved contacts');
    postCount++;
    const failing=postCount===storageFailureAt;
    if(storageFailure==='before'&&failing)throw Error('PRIVATE database write transport');
    if(storageFailure==='reject'&&failing)return json({message:'PRIVATE database refusal synthetic-treg-secret rae@example.com'},403);
    const incoming=Array.isArray(body)?body:[body],inserted=[];
    for(const row of incoming) {
      const existing=state.find(saved=>saved.id===row.id);
      if(existing) {
        if(!request.headers.get('prefer')?.includes('resolution=ignore-duplicates'))return json({message:'duplicate key'},409);
        continue;
      }
      const saved={id:row.id,created_at:tregStamp,updated_at:tregStamp,raw_input:structuredClone(row.raw_input)};
      state.push(saved);inserted.push(saved);applied.push(structuredClone(saved));
    }
    if(storageFailure==='after'&&failing)throw Error('PRIVATE lost write response');
    if(storageFailure==='malformed'&&failing)return json({not:'a contact receipt'});
    return json(inserted,201);
  };
  const contactsStore=createContactsStore({env:{SUPABASE_URL:'https://treg-contacts-storage.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-database-secret'},fetchImpl});
  const client=createTregPeopleClient({env:{TREG_TOKEN:token,SUPABASE_SERVICE_ROLE_KEY:'synthetic-database-secret',TREG_CALL_LOG_DIR:logDir,...tregEnv},fetchImpl,...(callLogger?{callLogger}:{})});
  const importer=createTregContactsImporter({client,contactsStore});
  const config=readConfig({NODE_ENV:production?'production':'development',DISCORD_GUILD_ID:'123'});
  const origin=production?'https://treg-contacts.example.test':'http://127.0.0.1';
  const siteAuth=createSiteAuth({config:readSiteAuthConfig({PUBLIC_ORIGIN:'https://treg-contacts.example.test',SITE_ACCESS_PASSWORD:'synthetic-treg-password',SITE_SESSION_SECRET:'synthetic-treg-session-secret-over-32-characters',SITE_DISCORD_ENABLED:'true'}),apiConfig:config});
  const cookie=siteAuth.issue('synthetic-treg-password').split(';')[0];
  const discordStore={configured:true,getPolicy:async()=>{discordCalls++;throw Error('No implicit Discord calls');},listSyncChannels:async()=>{discordCalls++;throw Error('No implicit Discord calls');}};
  const app=createApp({config,contactsStore,tregContactsImporter:importer,auth:auth??(production?siteAuth.auth:undefined),discordStore,provider:{},audit:{recordEvent:async entry=>audit.push(entry)}});
  const request=({body={query:tregQuery,requestId:tregRequestId},headers={},session=true,path='/api/contacts/import/treg',method='POST',signal,env}={})=>app.fetch(new Request(origin+path,{method,headers:{...(session?{cookie}:{}),origin,'content-type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),...(signal?{signal}:{})}),env);
  return {app,request,client,importer,contactsStore,mode,tregRequests,storageRequests,applied,audit,siteAuth,cookie,origin,logDir,temporaryRoot,get state(){return structuredClone(state);},get discordCalls(){return discordCalls;},edit(id,fields){const row=state.find(row=>row.id===id);Object.assign(row.raw_input,structuredClone(fields));row.updated_at='2026-10-26T20:01:00.654321+00:00';}};
}
