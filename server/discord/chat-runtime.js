import {readDiscordChatConfig} from './chat-config.js';
import {createDiscordChatClient} from './chat-client.js';
import {createDiscordChatAdapter} from './chat-adapter.js';
import {createDiscordChatRemote} from './chat-bridge.js';

/** Shares the existing collector's Gateway connection, never its checkpoint
 * queue. A chat outage must not block incoming-event ingestion. */
export async function createDiscordChatTransport({env=process.env,log=()=>{},signal} = {}) {
  const config=readDiscordChatConfig(env);
  if(!config.enabled)return null;
  const remote=createDiscordChatRemote({baseUrl:env.DISCORD_CHAT_API_ORIGIN,
    secret:env.DISCORD_CHAT_BRIDGE_SECRET,timeoutMs:config.requestTimeoutMs+30000});
  if(!config.configured||!remote.configured){log({status:'discord_chat_not_configured'});return null;}
  const client=createDiscordChatClient({config});
  const self=await client.getCurrentUser({signal});
  if(!self?.bot||typeof self.id!=='string'||!/^\d{1,20}$/.test(self.id))throw new Error('discord_chat_identity_unavailable');
  const adapter=createDiscordChatAdapter({config,client,botUserId:self.id,authorize:remote.authorize,
    runChat:remote.runChat,log});
  log({status:'discord_chat_ready'});
  return Object.freeze({...adapter,botUserId:self.id});
}
