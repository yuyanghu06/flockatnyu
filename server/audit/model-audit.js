import { SECRET_KEY, secretsFrom, serializer } from './serialization.js';
import {
  DIAGNOSTIC_CODES,
  diagnosticCounts,
  safeDiagnosticTool,
  safeBatchFailures,
  toolDiagnostics,
} from './diagnostics.js';
// Private returned-output audit. Prompts, tool read results and exception bodies never enter this API.
const DIAGNOSTIC_STATUS = Object.fromEntries(
  'unknown ready ok empty partial metadata_only pending deferred forbidden permission_denied access_denied channel_scope_denied forbidden_source cancelled aborted invalid_request invalid_tool_call invalid_completion invalid_result failed unavailable not_configured provider_unavailable request_timeout tool_failed team_request_required tool_result_error quota_exhausted budget_exhausted quota_state_unavailable reconciliation_deferred conflict stale not_found read_required context_limit unsupported_content result_too_large duplicate_call_skipped completed already_succeeded success succeeded applied started preflight_failed invalid_batch incomplete_batch call_limit audit_unavailable round_limit'
    .split(' ')
    .map((x) => [x, true]),
);
const TOOL_COUNT_KEYS = new Set(
  'sequence requested created existing updated unchanged failed unattempted inputs handled remaining calls miroDeferred miroDeferredBoards messages'.split(
    ' ',
  ),
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE_KEYS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
];
const token = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= 1e12 ? n : null);
const safeName = (s, max = 160) =>
  typeof s === 'string' && s.length <= max && /^[a-zA-Z0-9_.:/-]+$/.test(s) ? s : null;
const contextValue = (c) =>
  c &&
  ['chat', 'planner'].includes(c.agent) &&
  UUID.test(c.runId) &&
  (c.round === undefined || (Number.isInteger(c.round) && c.round >= 0 && c.round <= 10000))
    ? { agent: c.agent, runId: c.runId, round: c.round ?? null }
    : null;
export function estimateAuditCost({ provider, model, providerBaseHost, serviceTier }, usage) {
  if (
    !['openai', 'openai-compatible'].includes(provider) ||
    model !== 'gpt-6-luna' ||
    providerBaseHost !== 'api.openai.com' ||
    !['default', 'standard'].includes(serviceTier ?? 'default') ||
    token(usage?.inputTokens) === null ||
    usage.inputTokens > 272000 ||
    token(usage?.outputTokens) === null ||
    token(usage?.cacheReadTokens) === null ||
    token(usage?.cacheWriteTokens) === null ||
    usage.cacheReadTokens + usage.cacheWriteTokens > usage.inputTokens
  )
    return null;
  return {
    estimatedCostUsd:
      ((usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens) * 0.1 +
        usage.cacheReadTokens * 0.01 +
        usage.cacheWriteTokens * 0.125 +
        usage.outputTokens * 0.5) /
      1e6,
    pricingBasis: {
      version: '2026-10-19',
      currency: 'USD',
      perTokens: 1000000,
      input: 0.1,
      cacheRead: 0.01,
      cacheWrite: 0.125,
      output: 0.5,
      source: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
    },
  };
}
export function createAuditLogger({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  writeDiagnostic = (entry) => console.error(JSON.stringify(entry)),
} = {}) {
  const required =
    env.NODE_ENV === 'production' || String(env.MODEL_AUDIT_REQUIRED).toLowerCase() === 'true';
  let base;
  try {
    const u = new URL(env.SUPABASE_URL);
    if (
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      ['', '/'].includes(u.pathname) &&
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
    )
      base = u.origin;
  } catch {
    /* Unconfigured. */
  }
  const key =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const enabled = required || String(env.MODEL_AUDIT_ENABLED).toLowerCase() === 'true';
  const configured = Boolean(
    enabled && base && key && !/[\r\n]/.test(key) && typeof fetchImpl === 'function',
  );
  const timeout = Math.max(250, Math.min(10000, Number(env.MODEL_AUDIT_TIMEOUT_MS) || 3000));
  const secrets = secretsFrom(env),
    sanitize = serializer(secrets),
    calls = new Map();
  const metadata = (value, max) => {
    const clean = safeName(value, max);
    return clean && !secrets.some((secret) => clean.includes(secret)) ? clean : null;
  };
  const diagnostic = (operation) => {
    try {
      void Promise.resolve(
        writeDiagnostic({ event: 'model_audit_persistence_failed', operation }),
      ).catch(() => {});
    } catch {
      /* Diagnostics cannot leak or interrupt callers. */
    }
  };
  async function rpc(name, payload) {
    if (!configured) {
      if (required) diagnostic(name);
      return { status: required ? 'unavailable' : 'not_configured' };
    }
    const controller = new AbortController();
    let timer, reader;
    // Promise.race bounds even an injected fetch which does not honor AbortSignal.
    const pending = (async () => {
      try {
        const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ p_payload: payload }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('unavailable');
        }
        if (!response.body) throw new Error('unavailable');
        reader = response.body.getReader();
        let bytes = 0;
        const chunks = [];
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          bytes += r.value.byteLength;
          if (bytes > 4096) throw new Error('oversize');
          chunks.push(r.value);
        }
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result?.status !== 'ready') throw new Error('unavailable');
        return { status: 'ready' };
      } catch {
        return { status: 'unavailable' };
      } finally {
        try {
          await reader?.cancel();
          reader?.releaseLock();
        } catch {
          /* Reader teardown only. */
        }
      }
    })();
    const result = await Promise.race([
      pending,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          void reader?.cancel().catch(() => {});
          resolve({ status: 'unavailable' });
        }, timeout);
      }),
    ]);
    clearTimeout(timer);
    if (result.status !== 'ready') diagnostic(name);
    return result;
  }
  return Object.freeze({
    configured,
    required,
    async startModel({
      callId,
      context,
      provider,
      model,
      operation,
      stream = false,
      providerBaseHost,
      serviceTier,
    } = {}) {
      const c = contextValue(context);
      if (
        !UUID.test(callId) ||
        !c ||
        !metadata(provider) ||
        !metadata(model) ||
        !metadata(operation) ||
        typeof stream !== 'boolean'
      )
        return { status: 'unavailable' };
      if (calls.size >= 10000 && !calls.has(callId)) {
        for (const [id, x] of calls)
          if (x.finished || Number(now()) - x.startedAt >= 7 * 86400000) calls.delete(id);
        if (calls.size >= 10000) return { status: 'unavailable' };
      }
      const identity = {
        callId,
        ...c,
        provider,
        model,
        operation,
        stream,
        providerBaseHost: metadata(providerBaseHost, 253),
        serviceTier: metadata(serviceTier, 64) ?? 'default',
      };
      const result = await rpc('agent_audit_start_model', identity);
      if (result.status === 'ready') {
        calls.set(callId, { ...identity, startedAt: Number(now()) });
      }
      return result;
    },
    async finishModel({
      callId,
      status,
      responseId,
      providerRequestId,
      httpStatus,
      stopReason,
      usage,
      output,
      errorCode,
      serviceTier,
    } = {}) {
      const identity = calls.get(callId);
      if (!identity) return { status: configured || required ? 'unavailable' : 'not_configured' };
      if (!['succeeded', 'failed', 'aborted', 'cancelled'].includes(status))
        return { status: 'unavailable' };
      const normalizedUsage = Object.fromEntries(USAGE_KEYS.map((k) => [k, token(usage?.[k])]));
      const pricing = estimateAuditCost(
        { ...identity, serviceTier: serviceTier ?? identity.serviceTier },
        normalizedUsage,
      );
      const result = await rpc('agent_audit_finish_model', {
        callId,
        agent: identity.agent,
        runId: identity.runId,
        round: identity.round,
        status,
        responseId: metadata(responseId, 256),
        providerRequestId: metadata(providerRequestId, 256),
        httpStatus:
          Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
            ? httpStatus
            : null,
        stopReason: metadata(stopReason, 128),
        errorCode: metadata(errorCode, 128),
        usage: normalizedUsage,
        output: sanitize(output),
        estimatedCostUsd: pricing?.estimatedCostUsd ?? null,
        pricingBasis: pricing?.pricingBasis ?? null,
        serviceTier: metadata(serviceTier, 64) ?? identity.serviceTier,
      });
      if (result.status === 'ready') identity.finished = true;
      return result;
    },
    async recordEvent({
      eventId,
      context,
      kind,
      tool,
      status,
      durationMs,
      counts,
      diagnostics,
    } = {}) {
      const c = contextValue(context);
      if (
        !UUID.test(eventId) ||
        !c ||
        !['run_started', 'run_finished', 'tool_started', 'tool_finished'].includes(kind) ||
        (!diagnostics && (!metadata(status, 64) || (tool !== undefined && !metadata(tool, 160))))
      )
        return { status: 'unavailable' };
      const encoded = diagnostics ? diagnosticCounts(diagnostics) : {};
      const safeCounts = { ...encoded };
      if (counts && typeof counts === 'object')
        for (const [k, v] of Object.entries(counts).slice(0, 32 - Object.keys(encoded).length))
          if (
            (!diagnostics || TOOL_COUNT_KEYS.has(k)) &&
            /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k) &&
            !SECRET_KEY.test(k) &&
            Number.isSafeInteger(v) &&
            v >= 0 &&
            v <= 1e9
          )
            if (!Object.hasOwn(encoded, k)) safeCounts[k] = v;
      const safeTool = diagnostics && tool !== undefined ? safeDiagnosticTool(tool) : tool;
      if (['tool_finished', 'run_finished'].includes(kind) && diagnostics) {
        const label = (dictionary, code) =>
          Object.keys(dictionary).find((name) => dictionary[name] === code) || 'unknown';
        const safeStatus =
          Object.hasOwn(DIAGNOSTIC_STATUS, status) || Object.hasOwn(DIAGNOSTIC_CODES.reason, status)
            ? status
            : 'unknown';
        try {
          void Promise.resolve(
            writeDiagnostic({
              event: kind === 'tool_finished' ? 'agent_tool_diagnostic' : 'agent_run_diagnostic',
              eventId,
              ...c,
              ...(kind === 'tool_finished' ? { tool: safeTool } : {}),
              ...encoded,
              status: safeStatus,
              reason: label(DIAGNOSTIC_CODES.reason, encoded.reasonCode),
              stage: label(DIAGNOSTIC_CODES.stage, encoded.stageCode),
              outcome: label(DIAGNOSTIC_CODES.outcome, encoded.outcomeCode),
              durationMs: token(durationMs),
            }),
          ).catch(() => {});
        } catch {
          /* Log outages never change tool execution. */
        }
      }
      if (kind === 'tool_finished' && diagnostics)
        for (const item of safeBatchFailures(diagnostics.batchFailures)) {
          const itemCodes = diagnosticCounts(
            toolDiagnostics({
              result: { status: item.status, diagnostics: item },
              dispatched: item.dispatched === 1,
            }),
          );
          try {
            void Promise.resolve(
              writeDiagnostic({
                event: 'agent_tool_batch_item_diagnostic',
                eventId,
                ...c,
                tool: safeTool,
                itemIndex: item.itemIndex,
                status: item.status,
                stage: item.stage,
                reason: item.reason,
                ...itemCodes,
              }),
            ).catch(() => {});
          } catch {
            /* One diagnostic sink failure must not skip other rows. */
          }
        }
      return rpc('agent_audit_record_event', {
        eventId,
        ...c,
        kind,
        tool: safeTool ?? null,
        status: diagnostics
          ? Object.hasOwn(DIAGNOSTIC_STATUS, status) ||
            Object.hasOwn(DIAGNOSTIC_CODES.reason, status)
            ? status
            : 'unknown'
          : status,
        durationMs: token(durationMs),
        counts: safeCounts,
      });
    },
    prune() {
      return rpc('agent_audit_prune', {});
    },
  });
}
