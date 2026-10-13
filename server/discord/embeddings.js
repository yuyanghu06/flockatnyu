export function createEmbeddingProvider({config,fetchImpl = globalThis.fetch} = {}) {
  const e = config?.embedding || config || {};
  const configured = Boolean(e.configured && e.dimensions === 1536 && typeof fetchImpl === 'function');
  async function embed({texts,signal} = {}) {
    if (!configured) return {status:'not_configured',vectors:[]};
    if (!Array.isArray(texts) || !texts.length || texts.length > e.batchSize || texts.some(t => typeof t !== 'string' || !t.trim() || t.length > 12000)) return {status:'invalid_request',vectors:[]};
    try {
      const timeout = AbortSignal.timeout(20000), combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
      const response = await fetchImpl(`${e.baseUrl.replace(/\/$/,'')}/embeddings`,{method:'POST',headers:{Authorization:`Bearer ${e.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:e.model,input:texts,dimensions:1536}),signal:combined,redirect:'error'});
      if (!response.ok) return {status:response.status === 429 ? 'rate_limited' : 'unavailable',vectors:[]};
      const raw = await response.text(); if (raw.length > 3000000) return {status:'unavailable',vectors:[]};
      const data = JSON.parse(raw);
      if (!Array.isArray(data.data) || data.data.length !== texts.length) return {status:'unavailable',vectors:[]};
      const rows = [...data.data].sort((a,b) => a.index-b.index);
      if (rows.some((r,i) => r.index !== i || !Array.isArray(r.embedding) || r.embedding.length !== 1536 || r.embedding.some(v => typeof v !== 'number' || !Number.isFinite(v)))) return {status:'unavailable',vectors:[]};
      return {status:'ready',vectors:rows.map(r => r.embedding),model:e.model,provider:e.provider};
    } catch { return {status:signal?.aborted?'aborted':'unavailable',vectors:[]}; }
  }
  return Object.freeze({configured,embed});
}
