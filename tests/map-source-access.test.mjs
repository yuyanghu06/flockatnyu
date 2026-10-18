import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapSourceAuthorizer} from '../server/map/source-access.js';

const sourceId = '12345678-1234-1234-1234-123456789abc';
const principal = {id:'synthetic',allowedSourceIds:[sourceId],liveDiscord:{mode:'local-operator',guildId:'111'},googleAccess:true};
const discordUrl = 'https://discord.com/channels/111/222/333';
const miroUrl = 'https://miro.com/app/board/board%3D/?moveToWidget=widget';
const gmailUrl = 'https://mail.google.com/mail/u/0/#all/abc123';
function harness() {
  const calls = [];
  const dependencies = {
    liveDiscordService:{configured:true,readMessages:async args=>{
      calls.push(['discord',args]);return {status:'ready',sources:[{sourceId,url:discordUrl,guildId:'111',channelId:'222',messageId:'333'}]};}},
    miroStore:{configured:true,authorizedBoard:async args=>{
      calls.push(['miro',args]);return {status:'ready',data:{board_id:'board=',source_id:sourceId}};}},
    googleClient:{configured:true,readGmail:async args=>{
      calls.push(['gmail',args]);return {status:'ready',sources:[{kind:'gmail',externalId:'abc123',url:gmailUrl}]};}},
    gmailSourceId:sourceId,
  };
  return {calls,dependencies,authorize:createMapSourceAuthorizer(dependencies)};
}
test('map source access reuses current source services with exact references',async()=>{
  const {authorize,calls}=harness();
  for (const sourceUrl of [discordUrl,miroUrl,gmailUrl]) assert.equal(await authorize({principal,sourceId,sourceUrl}),true);
  assert.equal(calls[0][1].principal,principal);assert.equal(calls[0][1].context,false);
  assert.equal(calls[0][1].limit,1);assert.equal(calls[1][1].boardId,'board=');assert.equal(calls[2][1].messageId,'abc123');
});
test('map source grants cannot be inferred from URLs, forged identity, other accounts or extra query parameters',async()=>{
  const {authorize,calls}=harness();
  for(const sourceUrl of [discordUrl+'?expand=1',discordUrl+'#fragment',discordUrl.replace('/111/','/999/'),miroUrl+'&extra=1',miroUrl.replace('board%3D','board='),gmailUrl.replace('/u/0/','/u/1/'),'https://example.com/source','http://discord.com/channels/111/222/333','https://user@discord.com/channels/111/222/333'])assert.equal(await authorize({principal,sourceId,sourceUrl}),false,sourceUrl);
  for(const actor of [null,{...principal,allowedSourceIds:[]},{...principal,googleAccess:false}])assert.equal(await authorize({principal:actor,sourceId,sourceUrl:gmailUrl}),false);
  assert.equal(await authorize({principal,sourceId:'invalid',sourceUrl:discordUrl}),false);
  assert.equal(calls.length,0);
});
test('withdrawn policies, source mismatches, failures and aborted reads deny visibility',async()=>{
  const {dependencies}=harness();
  dependencies.liveDiscordService.readMessages=async()=>({status:'forbidden',sources:[]});
  dependencies.miroStore.authorizedBoard=async()=>({status:'ready',data:{board_id:'board=',source_id:'different'}});
  dependencies.googleClient.readGmail=async()=>{throw Error('PRIVATE');};
  const authorize=createMapSourceAuthorizer(dependencies);
  for(const sourceUrl of [discordUrl,miroUrl,gmailUrl])assert.equal(await authorize({principal,sourceId,sourceUrl}),false);
  const controller=new AbortController();controller.abort();
  assert.equal(await authorize({principal,sourceId,sourceUrl:discordUrl,signal:controller.signal}),false);
});
