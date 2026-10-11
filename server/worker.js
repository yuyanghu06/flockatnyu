import {pathToFileURL} from 'node:url';
import {createKnowledgeRepository} from './knowledge.js';

/** Separate one-shot process entry point for a future daily scheduler.
 * No connectors are implemented or invoked, and no successful sync is recorded.
 */
export async function runDailyWorker({env=process.env,repository=createKnowledgeRepository({env}),signal}={}) {
  if(signal?.aborted)return {status:'aborted',syncedSources:0};
  if(!repository.configured)return {status:'no_op',reason:'storage_not_configured',syncedSources:0};
  const configuredSources=(env.KNOWLEDGE_SYNC_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
  return {status:'no_op',reason:configuredSources.length?'connector_adapters_not_implemented':'no_configured_sources',syncedSources:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await runDailyWorker();
  console.log(JSON.stringify(result));
}
