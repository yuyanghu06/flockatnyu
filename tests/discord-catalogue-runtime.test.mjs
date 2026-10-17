import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {createDiscordStore} from '../server/discord/store.js';

test('catalogue store allows backend administrative capability and rejects ordinary reader before database access',async()=>{
 let calls=0;const store=createDiscordStore({env:{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},fetchImpl:()=>{calls++;assert.fail('ordinary reader attempted database RPC');}});
 for(const principal of [null,{}, {id:'reader',allowedSourceIds:[]},{isAdmin:false}]){
  assert.equal((await store.listChannels({principal})).status,'forbidden');assert.equal((await store.configurePolicy({principal})).status,'forbidden');assert.equal((await store.configureChannel({principal})).status,'forbidden');
 }
 assert.equal(calls,0);
});

test('retired archive modules and catalogue compatibility methods are physically absent',async()=>{
 for(const name of ['embeddings','live-summary-cli','live-summary-fetch','live-summary-schedule','live-summary-store','live-summary-embedding','memory','summaries','summary-cli','summary-schedule','summary-store','sync'])await assert.rejects(access(new URL('../server/discord/'+name+'.js',import.meta.url)),{code:'ENOENT'});
 for(const name of ['knowledge','retrieval-tools','summary-fallback'])await assert.rejects(access(new URL('../server/'+name+'.js',import.meta.url)),{code:'ENOENT'});
 const store=createDiscordStore({env:{}});
 for(const method of ['getSyncState','persistPage','listEmbeddingWork','saveEmbedding','search','resetArchive','rebuildMemory','listMemory','pageMemory'])assert(!Object.hasOwn(store,method),method);
});
