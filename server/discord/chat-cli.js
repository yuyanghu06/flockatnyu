import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readDiscordChatConfig} from './chat-config.js';
import {createDiscordChatClient} from './chat-client.js';

/** Explicit upsert of /ask only; other application commands are preserved. */
export async function registerDiscordChat({env=process.env,client} = {}) {
  const config=readDiscordChatConfig(env);
  if(!config.configured)return {status:'not_configured'};
  client ||= createDiscordChatClient({config});
  const self=await client.getCurrentUser();
  if(!self?.bot||!/^\d{1,20}$/.test(self.id))throw new Error('invalid_application');
  await client.registerAskCommand({applicationId:self.id,guildId:config.guildId});
  return {status:'registered',command:'ask'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3||process.argv[2]!=='register') {process.stderr.write('invalid_command\n');process.exitCode=1;}
  else registerDiscordChat().then(result=>{process.stdout.write(`${JSON.stringify(result)}\n`);if(result.status!=='registered')process.exitCode=1;})
    .catch(()=>{process.stderr.write('discord_chat_registration_failed\n');process.exitCode=1;});
}
