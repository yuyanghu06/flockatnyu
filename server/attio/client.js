import { readAttioConfig, validAttioSlug } from './config.js';
import { SOURCE_TOOL_TIMEOUT_MS } from "../shared/source-timeout.js";
import { plainObject, validUuid } from '../automation/validation.js';

const ORIGIN = 'https://api.attio.com/v2';
const MAX_RESPONSE_BYTES = 1048576;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const safeText = (value, max = 2000) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '';
export function validAttioValues(values) {
  if (!plainObject(values) || !Object.keys(values).length || Object.keys(values).length > 64 || !Object.keys(values).every(validAttioSlug)) return false;
  const seen = new Set();
  let nodes = 0;
  function visit(value, depth) {
    if (++nodes > 2000 || depth > 8) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'string') return value.length <= 16000;
    if (typeof value === 'number') return Number.isFinite(value);
    if ((!Array.isArray(value) && !plainObject(value)) || seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value) && (value.length > 200 || Object.keys(value).length !== value.length)) return false;
    if (Object.getOwnPropertySymbols(value).length) return false;
    const entries = Object.entries(value);
    if (entries.length > 200 || entries.some(([key, child]) => forbiddenKeys.has(key) || key.length > 100 || !visit(child, depth + 1))) return false;
    seen.delete(value);
    return true;
  }
  try { return visit(values, 0) && Buffer.byteLength(JSON.stringify(values)) <= 32768; } catch { return false; }
}
export function attioRecordUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'app.attio.com' && !url.username && !url.password && !url.port) return url.href;
  } catch {}
  return undefined;
}
class AttioError extends Error {
  constructor(code, diagnostics = {}) { super(code); this.code = code; this.diagnostics = { stage: 'response_parse', reason: code, ...diagnostics }; }
}
async function untilAborted(operation, signal) {
  if (signal.aborted) throw new AttioError('aborted');
  let abort;
  const cancelled = new Promise((_, reject) => { abort = () => reject(new AttioError('aborted')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(operation), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}
async function boundedBody(response, signal) {
  if (!response.body || Number(response.headers?.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel(); throw new AttioError('response_too_large');
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new AttioError('aborted');
      const { value, done } = await untilAborted(() => reader.read(), signal);
      if (signal.aborted) throw new AttioError('aborted');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new AttioError('response_too_large');
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new AttioError('invalid_response'); }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function identity(data, object, recordId) {
  const id = data?.id;
  if (!plainObject(data) || !validUuid(id?.workspace_id) || !validUuid(id?.object_id) || !validUuid(id?.record_id)
    || recordId && id.record_id !== recordId || data.object_slug !== undefined && data.object_slug !== object) throw new AttioError('invalid_response');
  return { object, recordId: id.record_id, objectId: id.object_id, workspaceId: id.workspace_id };
}
function record(data, object, recordId) {
  const result = identity(data, object, recordId);
  if (!plainObject(data.values)) throw new AttioError('invalid_response');
  return { ...result, values: data.values, ...(typeof data.created_at === 'string' ? { createdAt: safeText(data.created_at, 100) } : {}),
    ...(attioRecordUrl(data.web_url) ? { url: attioRecordUrl(data.web_url) } : {}) };
}

export function createAttioClient({ config = readAttioConfig(), fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const configured = Boolean(config.configured && typeof fetchImpl === 'function');
  const scope = object => validAttioSlug(object) && Array.isArray(config.allowedObjects) && config.allowedObjects.includes(object);
  async function run({ object, signal, write = false, method = 'GET', path, body, transform }) {
    if (!scope(object)) return { status: 'forbidden' };
    if (!configured) return { status: 'not_configured' };
    if (write && config.writesEnabled !== true) return { status: 'forbidden', reason: 'writes_disabled' };
    if (signal?.aborted) return { status: 'aborted' };
    const timeout = AbortSignal.timeout(config.timeoutMs || SOURCE_TOOL_TIMEOUT_MS);
    const active = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let dispatched = false, rejected = false;
    try {
      if (active.aborted) throw new AttioError('aborted');
      dispatched = true;
      const response = await untilAborted(() => fetchImpl(`${ORIGIN}${path}`, { method, redirect: 'error', signal: active,
        headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) }), active);
      if (!response.ok) {
        rejected = response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status);
        await response.body?.cancel();
        throw new AttioError(response.status === 401 ? 'reauthorization_required' : response.status === 403 ? 'permission_denied'
          : response.status === 404 ? 'not_found' : response.status === 429 ? 'rate_limited' : 'unavailable',
          { stage: 'provider_request', reason: 'http_error', httpStatus: response.status });
      }
      const data = await boundedBody(response, active);
      const output = transform(data);
      return { status: 'ready', ...output, observedAt: new Date(now()).toISOString() };
    } catch (error) {
      const status = signal?.aborted ? 'aborted' : timeout.aborted ? 'timeout' : error instanceof AttioError ? error.code : 'unavailable';
      const diagnostics = signal?.aborted || timeout.aborted ? { stage: 'provider_request', reason: status }
        : error instanceof AttioError ? error.diagnostics : { stage: 'provider_request', reason: 'network_error' };
      if (write && dispatched && !rejected) return { status: 'unavailable', reason: 'write_outcome_unknown', diagnostics };
      return { status, diagnostics };
    }
  }
  const pathFor = object => `/objects/${encodeURIComponent(object)}`;
  function searchRecords({ object, query, limit = 5, signal } = {}) {
    if (typeof query !== 'string' || !query.trim() || query.length > 256 || !Number.isInteger(limit) || limit < 1 || limit > 20) return Promise.resolve({ status: 'invalid_request' });
    return run({ object, signal, method: 'POST', path: '/objects/records/search', body: { query: query.trim(), objects: [object], request_as: { type: 'workspace' }, limit }, transform: payload => {
      if (!Array.isArray(payload?.data) || payload.data.length > limit) throw new AttioError('invalid_response');
      const records = payload.data.map(data => {
        if (data?.object_slug !== object || typeof data.record_text !== 'string') throw new AttioError('invalid_response');
        return { ...identity(data, object), text: safeText(data.record_text, 4000), ...(attioRecordUrl(data.web_url) ? { url: attioRecordUrl(data.web_url) } : {}) };
      });
      return { records, coverage: { complete: false, fuzzy: true, possiblyTruncated: records.length === limit } };
    } });
  }
  function readRecord({ object, recordId, signal } = {}) {
    if (!validUuid(recordId)) return Promise.resolve({ status: 'invalid_request' });
    return run({ object, signal, path: `${pathFor(object)}/records/${recordId}`, transform: payload => ({ record: record(payload?.data, object, recordId) }) });
  }
  function writeRecord({ object, recordId, values, signal } = {}, update = false) {
    if (update && !validUuid(recordId) || !validAttioValues(values)) return Promise.resolve({ status: 'invalid_request' });
    return run({ object, signal, write: true, method: update ? 'PATCH' : 'POST', path: `${pathFor(object)}/records${update ? `/${recordId}` : ''}`,
      body: { data: { values } }, transform: payload => ({ record: record(payload?.data, object, update ? recordId : undefined), outcome: update ? 'updated' : 'created' }) });
  }
  function listAttributes({ object, signal } = {}) {
    return run({ object, signal, path: `${pathFor(object)}/attributes`, transform: payload => {
      if (!Array.isArray(payload?.data) || payload.data.length > 1000) throw new AttioError('invalid_response');
      const attributes = payload.data.map(attribute => {
        if (!validAttioSlug(attribute?.api_slug) || typeof attribute.title !== 'string' || typeof attribute.type !== 'string') throw new AttioError('invalid_response');
        return { slug: attribute.api_slug, title: safeText(attribute.title, 300), type: safeText(attribute.type, 100),
          ...(typeof attribute.is_multiselect === 'boolean' ? { multiselect: attribute.is_multiselect } : {}),
          ...(typeof attribute.is_writable === 'boolean' ? { writable: attribute.is_writable } : {}),
          ...(typeof attribute.is_required === 'boolean' ? { required: attribute.is_required } : {}) };
      });
      return { attributes, coverage: { complete: false, reason: 'bounded_attribute_response' } };
    } });
  }
  return Object.freeze({ configured, config, sourceId: config.sourceId, allowedObjects: config.allowedObjects,
    writesEnabled: config.writesEnabled === true, searchRecords, readRecord,
    createRecord: args => writeRecord(args), updateRecord: args => writeRecord(args, true), listAttributes });
}
