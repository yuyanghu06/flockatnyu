import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiscordStore} from '../server/discord/store.js';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
test('catalogue metadata RPC remains callable without content persistence adapters',async()=>{
 const paths=[];const store=createDiscordStore({env,fetchImpl:async(url,options)=>{paths.push(new URL(url).pathname);assert.equal(options.redirect,'error');return Response.json([]);}});
 assert.equal((await store.listSyncChannels()).status,'ready');assert.deepEqual(paths,['/rest/v1/rpc/discord_sync_channels']);
});
