import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readMiroMcpConfig, MIRO_MCP_ENDPOINT, MIRO_MCP_READ_TOOLS } from './mcp-config.js';
import { MiroMcpError, createMiroMcpOAuthProvider, createBoundedMiroMcpFetch, acquireMiroMcpAuthLock } from './mcp-auth.js';
export { MiroMcpError, miroMcpErrorCode } from './mcp-auth.js';
import {requestMiroBrokerToken} from './token-broker.js';

export function createMiroMcpClient({ config = readMiroMcpConfig(), fetchImpl = globalThis.fetch } = {}) {
  // Construction does no network work. Serialize calls to avoid concurrent OAuth
  // refresh-token rotation and keep each SDK session bounded to one operation.
  const provider = createMiroMcpOAuthProvider({ config });
  const queue=[];
  let active=false;
  function drain() {
    if(active||!queue.length)return;
    const job=queue.shift();active=true;
    job.signal?.removeEventListener('abort',job.abort);
    execute(job.action,{signal:job.signal}).then(job.resolve,job.reject).finally(()=>{active=false;drain();});
  }
  function run(action,{signal}={}) {
    if(!config.configured)return Promise.reject(new MiroMcpError('not_configured'));
    if(signal?.aborted)return Promise.reject(new MiroMcpError('aborted'));
    if(queue.length>=64)return Promise.reject(new MiroMcpError('queue_full'));
    return new Promise((resolve,reject)=>{
      const job={action,signal,resolve,reject};
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
  async function execute(action,{signal}={}) {
    if(signal?.aborted)throw new MiroMcpError('aborted');
    const timeout = AbortSignal.timeout(config.requestTimeoutMs);
    const combined = AbortSignal.any([signal, timeout].filter(Boolean));
    let releaseLock;
    const client = new Client({ name: 'tech-nyu-miro-reader', version: '1.0.0' });
    client.onerror = () => {}; // SDK errors can contain private upstream text.
    const brokerMode=Boolean(config.tokenBrokerUrl);
    let brokerToken,refreshed=false;
    const boundedFetch=createBoundedMiroMcpFetch({fetchImpl,config,signal:combined});
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
      if (signal?.aborted) throw new MiroMcpError('aborted');
      if (timeout.aborted) throw new MiroMcpError('request_timeout');
      if (error instanceof MiroMcpError) throw error;
      throw new MiroMcpError(error?.name === 'UnauthorizedError' ? 'auth_required' : 'mcp_upstream_error');
    } finally { combined.removeEventListener('abort', abort); await client.close().catch(() => {}); await releaseLock?.(); }
  }
  return Object.freeze({ configured: config.configured,
    listTools: options => run(async (client, signal) => {
      const result = await client.listTools({}, { signal, timeout: config.requestTimeoutMs });
      return { ...result, tools: result.tools.filter(tool => MIRO_MCP_READ_TOOLS.includes(tool.name)) };
    }, options),
    callTool(name, args, options) {
      if (!MIRO_MCP_READ_TOOLS.includes(name)) return Promise.reject(new MiroMcpError('tool_not_allowed'));
      if (!args || typeof args !== 'object' || Array.isArray(args) || Buffer.byteLength(JSON.stringify(args)) > 32768) return Promise.reject(new MiroMcpError('invalid_arguments'));
      return run(async (client, signal) => {
        const result = await client.callTool({ name, arguments: args }, undefined, { signal, timeout: config.requestTimeoutMs });
        if (result.isError) throw new MiroMcpError('tool_result_error');
        return result;
      }, options);
    },
  });
}
