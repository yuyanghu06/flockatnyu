// Server-only insert adapter. UUID comes from the chat request, never the model.
export function createBugReportStore({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let base;
  try {
    const url = new URL(env.SUPABASE_URL);
    if ((url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))
      && !url.username && !url.password && !url.search && !url.hash && ['','/'].includes(url.pathname)) base = url.origin;
  } catch {}
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const configured = Boolean(base && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function');
  return Object.freeze({ configured, async record({ reportId, report, signal } = {}) {
    if (!configured) return { status: 'not_configured' };
    if (signal?.aborted) return { status: 'aborted' };
    try {
      const active = AbortSignal.any([signal, AbortSignal.timeout(15000)].filter(Boolean));
      const response = await fetchImpl(`${base}/rest/v1/rpc/bug_report_record`, {
        method: 'POST', redirect: 'error', signal: active,
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_uuid: reportId, p_report: report }),
      });
      if (!response.ok) { await response.body?.cancel(); return { status: response.status === 404 ? 'schema_not_ready' : 'unavailable' }; }
      const chunks = []; let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 4096) throw new Error('response_limit');
        chunks.push(chunk);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result.status === 'conflict') return { status: 'conflict' };
      if (result.status !== 'ready' || result.reportId !== reportId || typeof result.createdAt !== 'string'
        || !['created','already_saved'].includes(result.outcome)) return { status: 'unavailable' };
      return { status: 'ready', reportId, createdAt: result.createdAt, outcome: result.outcome };
    } catch { return { status: signal?.aborted ? 'aborted' : 'unavailable' }; }
  } });
}
