import {SOURCE_TOOL_TIMEOUT_MS} from '../source-timeout.js';
import { MiroMcpError } from './mcp-auth.js';

export const MIRO_QUOTA_KEY = 'subscription:miro-mcp-budget:v1';
export const MIRO_QUOTA_LIMITS = Object.freeze({ daily: 80, background: 48, session: 12, cadenceMs: 21600000, sessionMs: 600000 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected.sort().join(',');
function fail(code, retryAt) { const error = new MiroMcpError(code); if (retryAt) error.retryAt = retryAt; throw error; }
export function nextMiroQuotaReset(now = Date.now()) {
  const date = new Date(now); date.setUTCHours(24, 0, 0, 0); return date.toISOString();
}

// Only explicit upstream error envelopes can establish exhaustion. Successful
// board text is source content, even if it repeats the same words or a URL.
export function isMiroDailyQuotaError(result) {
  if (result?.isError !== true || !Array.isArray(result.content)) return false;
  return result.content.some(part => part?.type === 'text' && typeof part.text === 'string' && part.text.length <= 32768
    && /\bmiro\b/i.test(part.text) && /\bdaily\b/i.test(part.text)
    && /\btool\s+calls?\b/i.test(part.text) && /\blimit\b/i.test(part.text) && /\b(?:reached|exceeded)\b/i.test(part.text));
}
export const classifyMiroToolError = result => isMiroDailyQuotaError(result) ? 'quota_exhausted' : 'tool_result_error';

function validate(state) {
  if (state === null) return;
  if (!keys(state, ['version','day','total','background','blockedUntil','lastBackgroundAt','session'])
    || state.version !== 1 || typeof state.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(state.day)
    || !timestamp(`${state.day}T00:00:00.000Z`) || !integer(state.total,80) || !integer(state.background,48)
    || state.background > state.total || !(state.blockedUntil === null || timestamp(state.blockedUntil))
    || !(state.lastBackgroundAt === null || timestamp(state.lastBackgroundAt))) fail('quota_state_unavailable');
  if (state.blockedUntil !== null && state.blockedUntil !== nextMiroQuotaReset(`${state.day}T00:00:00.000Z`)) fail('quota_state_unavailable');
  if (state.session !== null && (!keys(state.session,['id','startedAt','calls']) || !UUID.test(state.session.id)
    || !timestamp(state.session.startedAt) || !integer(state.session.calls,12) || state.session.calls === 0
    || state.session.startedAt !== state.lastBackgroundAt)) fail('quota_state_unavailable');
}

export function createMiroMcpQuota({ store, now = Date.now } = {}) {
  let localBlockedUntil = null;
  async function update(change, signal) {
    const active = AbortSignal.any([AbortSignal.timeout(SOURCE_TOOL_TIMEOUT_MS), ...(signal ? [signal] : [])]);
    for (let attempt = 0; attempt < 8; attempt++) {
      if (active.aborted) fail(signal?.aborted ? 'aborted' : 'quota_state_unavailable');
      let previous;
      try { previous = await store.getState(MIRO_QUOTA_KEY, { signal: active }); }
      catch { fail(signal?.aborted ? 'aborted' : 'quota_state_unavailable'); }
      if (active.aborted) fail(signal?.aborted ? 'aborted' : 'quota_state_unavailable');
      validate(previous);
      const instant = Number(new Date(now()));
      if (!Number.isFinite(instant)) fail('quota_state_unavailable');
      const day = new Date(instant).toISOString().slice(0,10);
      if (previous?.day > day || previous?.lastBackgroundAt && Date.parse(previous.lastBackgroundAt) > instant) fail('quota_state_unavailable');
      const state = previous?.day === day ? structuredClone(previous) : { version:1, day, total:0, background:0, blockedUntil:null,
        lastBackgroundAt:previous?.lastBackgroundAt ?? null, session:previous?.session ?? null };
      const next = change(state, instant);
      if (active.aborted) fail(signal?.aborted ? 'aborted' : 'quota_state_unavailable');
      let committed;
      try { committed = await store.casState(MIRO_QUOTA_KEY, previous, next, { signal:active }); }
      catch { fail(signal?.aborted ? 'aborted' : 'quota_state_unavailable'); }
      if (committed === true) return;
      if (committed !== false) fail('quota_state_unavailable');
    }
    fail('quota_state_unavailable');
  }
  return Object.freeze({
    async reserve({ lane = 'chat', sessionId, signal } = {}) {
      if (signal?.aborted) fail('aborted');
      const instant = Number(new Date(now()));
      if (localBlockedUntil && instant < Date.parse(localBlockedUntil)) fail('quota_exhausted',localBlockedUntil);
      return update((state, time) => {
        const reset = nextMiroQuotaReset(time);
        if (state.blockedUntil && time < Date.parse(state.blockedUntil)) fail('quota_exhausted',state.blockedUntil);
        if (!['chat','background'].includes(lane)) fail('quota_state_unavailable');
        if (state.total >= 80 || lane === 'background' && state.background >= 48) fail('budget_exhausted',reset);
        if (lane === 'background') {
          if (!UUID.test(sessionId ?? '')) fail('reconciliation_deferred');
          if (state.session?.id !== sessionId) {
            const nextStart = Date.parse(state.lastBackgroundAt ?? '1970-01-01T00:00:00.000Z') + MIRO_QUOTA_LIMITS.cadenceMs;
            if (time < nextStart) fail('reconciliation_deferred',new Date(nextStart).toISOString());
            state.lastBackgroundAt = new Date(time).toISOString();
            state.session = { id:sessionId, startedAt:state.lastBackgroundAt, calls:0 };
          }
          if (time - Date.parse(state.session.startedAt) >= MIRO_QUOTA_LIMITS.sessionMs || state.session.calls >= 12)
            fail('reconciliation_deferred',new Date(Date.parse(state.lastBackgroundAt)+MIRO_QUOTA_LIMITS.cadenceMs).toISOString());
          state.session.calls++; state.background++;
        }
        state.total++; return state;
      },signal);
    },
    async markExhausted({ signal } = {}) {
      localBlockedUntil = nextMiroQuotaReset(now());
      await update((state,time) => { state.blockedUntil = nextMiroQuotaReset(time); return state; },signal);
      return localBlockedUntil;
    },
  });
}
