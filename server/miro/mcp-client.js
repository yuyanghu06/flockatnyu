import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readMiroMcpConfig, MIRO_MCP_ENDPOINT, MIRO_MCP_READ_TOOLS } from './mcp-config.js';
import { MiroMcpError, createMiroMcpOAuthProvider, createBoundedMiroMcpFetch, acquireMiroMcpAuthLock } from './mcp-auth.js';
export { MiroMcpError, miroMcpErrorCode } from './mcp-auth.js';
import {requestMiroBrokerToken} from './token-broker.js';
import { randomUUID } from 'node:crypto';
import { createGmailSubscriptionStore } from '../google/subscription-store.js';
import { createMiroMcpQuota, isMiroDailyQuotaError, nextMiroQuotaReset } from './quota.js';
export { isMiroDailyQuotaError, classifyMiroToolError } from './quota.js';

export function createMiroMcpClient({ env = process.env, config = readMiroMcpConfig(env), fetchImpl = globalThis.fetch, now = Date.now, lane = 'chat', quota, quotaStore } = {}) {
  // Construction does no network work. Serialize calls to avoid concurrent OAuth
  // refresh-token rotation and keep each SDK session bounded to one operation.
  const provider = createMiroMcpOAuthProvider({ config });
  let governor = quota, sessionId;
  function quotaGovernor() {
    if (governor) return governor;
    try { return governor = createMiroMcpQuota({ store: quotaStore ?? createGmailSubscriptionStore({ url:env.SUPABASE_URL, serviceRoleKey:env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl }), now }); }
    catch { throw new MiroMcpError('quota_state_unavailable'); }
  }
  const queue=[];
  let active=false;
  function drain() {
    if(active||!queue.length)return;
    const job=queue.shift();active=true;
    job.signal?.removeEventListener('abort',job.abort);
    execute(job.action,{signal:job.signal,batchSessionId:job.batchSessionId}).then(job.resolve,job.reject).finally(()=>{active=false;drain();});
  }
  function run(action,{signal}={},batchSessionId) {
    if(!config.configured)return Promise.reject(new MiroMcpError('not_configured'));
    if(signal?.aborted)return Promise.reject(new MiroMcpError('aborted'));
    if(queue.length>=64)return Promise.reject(new MiroMcpError('queue_full'));
    return new Promise((resolve,reject)=>{
      const job={action,signal,batchSessionId,resolve,reject};
      job.abort=()=>{
        const index=queue.indexOf(job);
        if(index<0)return; // The active operation owns its own cancellation.
        queue.splice(index,1);signal.removeEventListener('abort',job.abort);
        reject(new MiroMcpError('aborted'));
      };
      signal?.addEventListener('abort',job.abort,{once:true});
      queue.push(job);drain();
    });
  }
  async function execute(action,{signal,batchSessionId}={}) {
    if(signal?.aborted)throw new MiroMcpError('aborted');
    const timeout = AbortSignal.timeout(config.requestTimeoutMs);
    const combined = AbortSignal.any([signal, timeout].filter(Boolean));
    let releaseLock;
    const client = new Client({ name: 'tech-nyu-miro-reader', version: '1.0.0' });
    client.onerror = () => {}; // SDK errors can contain private upstream text.
    const brokerMode=Boolean(config.tokenBrokerUrl);
    let brokerToken,refreshed=false;
    // The SDK can replay a tools/call after OAuth and the broker can replay a
    // rejected token. Reserve at the physical send boundary so each attempt is
    // counted, while initialization, discovery and token exchange remain free.
    const countedFetch = async (input, init = {}) => {
      const active = AbortSignal.any([combined, init.signal].filter(Boolean));
      if (active.aborted) throw new MiroMcpError('aborted');
      if (config.budgetEnabled && init.method === 'POST' && typeof init.body === 'string') {
        let message;
        try { message = JSON.parse(init.body); } catch { /* OAuth form bodies are not MCP calls. */ }
        const messages = Array.isArray(message) ? message : [message];
        for (const request of messages) {
          if (request?.jsonrpc === '2.0' && request.method === 'tools/call' && request.id !== undefined)
            await quotaGovernor().reserve({ lane, sessionId:batchSessionId, signal:active });
        }
      }
      if (active.aborted) throw new MiroMcpError('aborted');
      return fetchImpl(input, init);
    };
    const boundedFetch=createBoundedMiroMcpFetch({fetchImpl:countedFetch,config,signal:combined});
    const upstreamFetch=brokerMode?async(input,init={})=>{
      const send=()=>{const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${brokerToken.accessToken}`);return boundedFetch(input,{...init,headers});};
      const result=await send();
      if(result.status!==401||refreshed)return result;
      refreshed=true;await result.body?.cancel();
      brokerToken=await requestMiroBrokerToken({config,fetchImpl,signal:combined,forceRefresh:true,rejectedAccessToken:brokerToken.accessToken});
      return send();
    }:boundedFetch;
    const transport = new StreamableHTTPClientTransport(new URL(MIRO_MCP_ENDPOINT), {
      ...((brokerMode || config.accessToken && !config.refreshToken) ? {} : { authProvider: provider }),
      fetch: upstreamFetch,
      requestInit: { redirect: 'error', ...(!brokerMode && config.accessToken && !config.refreshToken ? { headers: { Authorization: `Bearer ${config.accessToken}` } } : {}) },
      reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    });
    const abort = () => { void client.close().catch(() => {}); };
    combined.addEventListener('abort', abort, { once: true });
    try {
      if(brokerMode)brokerToken=await requestMiroBrokerToken({config,fetchImpl,signal:combined});
      if (!brokerMode && (!config.accessToken || config.refreshToken)) releaseLock = await acquireMiroMcpAuthLock(config.authFile, { signal: combined });
      await client.connect(transport, { signal: combined, timeout: config.requestTimeoutMs });
      const result = await action(client, combined);
      if (combined.aborted) throw new MiroMcpError(signal?.aborted ? 'aborted' : 'request_timeout');
      if (Buffer.byteLength(JSON.stringify(result)) > config.maxResponseBytes) throw new MiroMcpError('response_byte_limit');
      return result;
    } catch (error) {
      if (error instanceof MiroMcpError && ['quota_exhausted','quota_state_unavailable'].includes(error.code)) throw error;
      if (signal?.aborted) throw new MiroMcpError('aborted');
      if (timeout.aborted) throw new MiroMcpError('request_timeout');
      if (error instanceof MiroMcpError) throw error;
      throw new MiroMcpError(error?.name === 'UnauthorizedError' ? 'auth_required' : 'mcp_upstream_error');
    } finally { combined.removeEventListener('abort', abort); await client.close().catch(() => {}); await releaseLock?.(); }
  }
  return Object.freeze({ configured: config.configured,
    beginBackgroundBatch() { sessionId = randomUUID(); return sessionId; },
    listTools: options => run(async (client, signal) => {
      const result = await client.listTools({}, { signal, timeout: config.requestTimeoutMs });
      return { ...result, tools: result.tools.filter(tool => MIRO_MCP_READ_TOOLS.includes(tool.name)) };
    }, options),
    callTool(name, args, options) {
      if (!MIRO_MCP_READ_TOOLS.includes(name)) return Promise.reject(new MiroMcpError('tool_not_allowed'));
      if (!args || typeof args !== 'object' || Array.isArray(args) || Buffer.byteLength(JSON.stringify(args)) > 32768) return Promise.reject(new MiroMcpError('invalid_arguments'));
      const batchSessionId = sessionId;
      return run(async (client, signal) => {
        if (signal.aborted) throw new MiroMcpError('aborted');
        const result = await client.callTool({ name, arguments: args }, undefined, { signal, timeout: config.requestTimeoutMs });
        if (isMiroDailyQuotaError(result)) {
          // Persist the organization cooldown even when this batch is canceled.
          // This cleanup is bounded independently; no provider text escapes.
          let retryAt = nextMiroQuotaReset(now());
          if (config.budgetEnabled) retryAt = await quotaGovernor().markExhausted({ signal:AbortSignal.timeout(5000) });
          const error = new MiroMcpError('quota_exhausted'); error.retryAt = retryAt; throw error;
        }
        if (result.isError) throw new MiroMcpError('tool_result_error');
        return result;
      }, options, batchSessionId);
    },
  });
}
