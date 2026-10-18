import {readMiroConfig, isMiroScheduleDue} from './config.js';
import {createMiroClient, MiroError, miroErrorCode} from './client.js';
import {createMiroStore} from './store.js';
import {fetchBoardSnapshot, snapshotContentHash} from './snapshot.js';
export async function preflightMiro({config = readMiroConfig(), store = createMiroStore(), createClient = createMiroClient, signal} = {}) {
  const result = {status:'ready',enabled:config.enabled,configured:config.configured,databaseConfigured:store.configured,issues:config.issues,boards:config.boardIds.length,readable:0,failed:0,readOnly:true};
  if (!config.configured) return {...result,status:'not_configured'};
  const client = createClient({config,signal});
  for (const boardId of config.boardIds) { try { await client.readBoard(boardId,{signal}); result.readable++; } catch { result.failed++; } }
  return {...result,status:result.failed ? 'failed' : !store.configured ? 'database_not_configured' : 'ready'};
}
export async function runMiroSync({config = readMiroConfig(), store = createMiroStore(), createClient = createMiroClient, mode = 'sync', signal, now = Date.now, log = () => {}} = {}) {
  if (!['sync','scheduled'].includes(mode)) return {status:'invalid_mode',succeeded:0,failed:0,busy:0};
  if (!config.enabled) return {status:'disabled',succeeded:0,failed:0,busy:0};
  if (mode === 'scheduled' && !isMiroScheduleDue(new Date(now()))) return {status:'outside_schedule',succeeded:0,failed:0,busy:0};
  if (!config.configured || !store.configured) return {status:'not_configured',issues:config.issues,succeeded:0,failed:0,busy:0};
  const deadline = AbortSignal.timeout(config.maxRunMs);
  const combined = AbortSignal.any([signal,deadline].filter(Boolean));
  const result = {status:'ready',succeeded:0,failed:0,busy:0};
  for (const boardId of config.boardIds) {
    if (combined.aborted) { result.failed++; result.status = 'aborted'; break; }
    let lease;
    try {
      const registration = await store.register({boardId,teamId:config.teamId,signal:combined});
      if (registration.status !== 'ready') throw new MiroError(`store_${registration.status}`);
      const claimed = await store.claim({boardId,leaseSeconds:config.leaseSeconds,signal:combined});
      if (claimed.status === 'busy') { result.busy++; continue; }
      if (claimed.status !== 'ready') throw new MiroError(`store_${claimed.status}`);
      lease = {boardId,leaseToken:claimed.leaseToken,configRevision:claimed.configRevision,leaseSeconds:config.leaseSeconds};
      let renewedAt = now();
      const progress = async (force = false) => {
        if (combined.aborted) throw new MiroError('aborted');
        if (!force && now() - renewedAt < Math.min(30000,config.leaseSeconds * 1000 / 3)) return;
        const renewed = await store.renew({...lease,signal:combined});
        if (renewed.status !== 'ready') throw new MiroError('lease_lost');
        renewedAt = now();
      };
      const client = createClient({config,signal:combined,onProgress:progress,now});
      const snapshot = await fetchBoardSnapshot({client,boardId,config,signal:combined,onProgress:progress,now:() => new Date(now())});
      await progress(true);
      const finished = await store.finish({...lease,snapshot,contentHash:snapshotContentHash(snapshot),signal:combined});
      if (finished.status !== 'ready') throw new MiroError('publish_rejected');
      result.succeeded++;
      log({status:'board_synced',counts:snapshot.coverage.counts});
    } catch (error) {
      const code = miroErrorCode(error);
      result.failed++;
      // Cleanup gets its own short timeout after process cancellation; RPC token/revision
      // guards still prevent this worker from changing a newer lease or configuration.
      if (lease) await store.fail({...lease,errorCode:code,signal:AbortSignal.timeout(10000)}).catch(() => {});
      log({status:'board_failed',code});
    }
  }
  if (result.status === 'ready' && result.failed) result.status = 'failed';
  return result;
}
