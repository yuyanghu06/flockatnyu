import {pathToFileURL} from 'node:url';
import {createKnowledgeRepository} from './knowledge.js';
import {readDiscordConfig} from './discord/config.js';
import {createDiscordStore} from './discord/store.js';
import {createDiscordClient} from './discord/client.js';
import {createEmbeddingProvider} from './discord/embeddings.js';
import {runDiscordOneShot} from './discord/cli.js';

/** One-shot job: exits after its bounded archive/embedding work. */
export async function runDailyWorker({env=process.env,repository=createKnowledgeRepository({env}),discordConfig=readDiscordConfig(env),store=createDiscordStore({env}),client=createDiscordClient({config:discordConfig}),embedder=createEmbeddingProvider({config:discordConfig.embedding}),signal}={}) {
  if(signal?.aborted)return {status:'aborted',syncedSources:0};
  if(discordConfig.configured){
    return runDiscordOneShot({env,config:discordConfig,store,client,embedder,signal});
  }
  if(!repository.configured)return {status:'no_op',reason:'storage_not_configured',syncedSources:0};
  const configuredSources=(env.KNOWLEDGE_SYNC_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
  return {status:'no_op',reason:configuredSources.length?'connector_adapters_not_implemented':'no_configured_sources',syncedSources:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await runDailyWorker();
  console.log(JSON.stringify(result));
  if(['failed','aborted','unavailable','forbidden'].includes(result.status)||result.errors?.length||!['disabled','ready',undefined].includes(result.embeddingStatus))process.exitCode=1;
}
