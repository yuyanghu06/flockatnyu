import {createHash,timingSafeEqual} from 'node:crypto';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
import {readMiroMcpConfig,MIRO_MCP_ENDPOINT} from './mcp-config.js';
import {MiroMcpError,createMiroMcpOAuthProvider,createBoundedMiroMcpFetch,acquireMiroMcpAuthLock} from './mcp-auth.js';

const validToken=value=>typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\r\n\0]/.test(value);
const digest=value=>createHash('sha256').update(value).digest();
const headers={'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'};
const response=(value,status=200)=>Response.json(value,{status,headers});
const aborted=signal=>{if(signal?.aborted)throw new MiroMcpError('aborted');};
async function waitFor(promise,signal) {
  aborted(signal);
  let listener;
  try{return await Promise.race([promise,new Promise((_,reject)=>{listener=()=>reject(new MiroMcpError('aborted'));signal?.addEventListener('abort',listener,{once:true});})]);}
  finally{signal?.removeEventListener('abort',listener);}
}
async function boundedJson(body,signal,maxBytes=65536) {
  if(Number(body.headers.get('content-length'))>maxBytes)throw new MiroMcpError('invalid_broker_response');
  const reader=body.body?.getReader();if(!reader)throw new MiroMcpError('invalid_broker_response');
  const chunks=[];let length=0;
  try{
    while(true){const part=await waitFor(reader.read(),signal);if(part.done)break;length+=part.value.byteLength;if(length>maxBytes)throw new MiroMcpError('invalid_broker_response');chunks.push(part.value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(error){void reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
}
function tokenRecord(tokens,savedAt) {
  if(!validToken(tokens?.access_token)||tokens.access_token==='refresh-required')return null;
  const age=Date.parse(savedAt),seconds=tokens.expires_in;
  const expiresAt=Number.isFinite(age)&&Number.isFinite(seconds)&&seconds>0?new Date(age+seconds*1000).toISOString():null;
  return {accessToken:tokens.access_token,expiresAt};
}

// One persistent OAuth owner. Other services receive only short-lived access
// tokens and still contact the fixed official MCP endpoint directly.
export function createMiroTokenBroker({env=process.env,config=readMiroMcpConfig(env),fetchImpl=globalThis.fetch,now=()=>new Date()}={}) {
  const secret=env.MIRO_TOKEN_BROKER_SECRET;
  const configured=config.configured&&!config.tokenBrokerUrl&&config.persistAuth===true&&typeof secret==='string'&&secret.length>=32&&secret.length<=512&&!/[\r\n\0]/.test(secret);
  const expected=configured?digest(`Bearer ${secret}`):null;
  const provider=createMiroMcpOAuthProvider({config,now});
  let cached;
  const current=record=>record&&(!record.expiresAt||Date.parse(record.expiresAt)>new Date(now()).getTime()+60000);
  async function access({forceRefresh,rejectedAccessToken,signal}) {
    if(current(cached)&&(!forceRefresh||cached.accessToken!==rejectedAccessToken))return cached;
    const release=await acquireMiroMcpAuthLock(config.authFile,{signal});
    try{
      aborted(signal);
      const tokens=await provider.tokens();
      const record=tokenRecord(tokens,await provider.tokensSavedAt());
      if(current(record)&&(!forceRefresh||record.accessToken!==rejectedAccessToken)){cached=record;return record;}
      if(!tokens?.refresh_token)throw new MiroMcpError('auth_required');
      const result=await auth(provider,{serverUrl:new URL(MIRO_MCP_ENDPOINT),fetchFn:createBoundedMiroMcpFetch({fetchImpl,config,signal})});
      aborted(signal);
      if(result!=='AUTHORIZED')throw new MiroMcpError('auth_required');
      cached=tokenRecord(await provider.tokens(),await provider.tokensSavedAt());
      if(!current(cached))throw new MiroMcpError('auth_required');
      return cached;
    }finally{await release();}
  }
  return Object.freeze({configured,async handle(request) {
    if(new URL(request.url).pathname!=='/internal/miro/token')return response({error:'not_found'},404);
    if(!configured)return response({error:'unavailable'},503);
    const supplied=request.headers.get('authorization')||'';
    if(supplied.length>1024||!timingSafeEqual(digest(supplied),expected))return response({error:'forbidden'},403);
    if(request.method!=='POST')return response({error:'method_not_allowed'},405);
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(config.requestTimeoutMs)]);
    let body;
    try{body=await boundedJson(request,signal);}
    catch{return response({error:'invalid_request'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['forceRefresh','rejectedAccessToken'].includes(key))
      ||body.forceRefresh!==undefined&&typeof body.forceRefresh!=='boolean'||body.forceRefresh===true&&!validToken(body.rejectedAccessToken)
      ||body.forceRefresh!==true&&body.rejectedAccessToken!==undefined)return response({error:'invalid_request'},400);
    try{return response(await access({forceRefresh:body.forceRefresh===true,rejectedAccessToken:body.rejectedAccessToken,signal}));}
    catch{return response({error:'unavailable'},503);}
  }});
}

// The broker URL is deployment-owned configuration, never a tool argument.
// Its shared secret never reaches the separate official MCP fetch function.
export async function requestMiroBrokerToken({config,fetchImpl=globalThis.fetch,signal,forceRefresh=false,rejectedAccessToken}={}) {
  let url;
  try{url=new URL(config.tokenBrokerUrl);}catch{throw new MiroMcpError('token_broker_unavailable');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/internal/miro/token'||url.search||url.hash||typeof config.tokenBrokerSecret!=='string'||config.tokenBrokerSecret.length<32)throw new MiroMcpError('token_broker_unavailable');
  const combined=AbortSignal.any([signal,AbortSignal.timeout(config.requestTimeoutMs)].filter(Boolean));
  try{
    aborted(combined);
    const result=await waitFor(fetchImpl(url.href,{method:'POST',redirect:'error',signal:combined,headers:{Authorization:`Bearer ${config.tokenBrokerSecret}`,'Content-Type':'application/json'},body:JSON.stringify({forceRefresh,...(forceRefresh?{rejectedAccessToken}:{})})}),combined);
    if(result.status!==200||result.redirected||result.url&&result.url!==url.href){await result.body?.cancel();throw new MiroMcpError('token_broker_unavailable');}
    const value=await boundedJson(result,combined);
    if(!value||Object.keys(value).length!==2||!validToken(value.accessToken)||value.expiresAt!==null&&(!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now()))throw new MiroMcpError('token_broker_unavailable');
    return value;
  }catch{throw new MiroMcpError(combined.aborted?'aborted':'token_broker_unavailable');}
}
