import { plainObject } from '../../automation/validation.js';
import { attioRecordUrl } from '../client.js';

const diagnosticReasons = new Set([
  'http_error',
  'network_error',
  'timeout',
  'aborted',
  'invalid_response',
  'response_too_large',
]);
export function safeDiagnostics(value) {
  if (
    !plainObject(value) ||
    !['local_validation', 'provider_request', 'response_parse'].includes(value.stage) ||
    !diagnosticReasons.has(value.reason)
  )
    return undefined;
  return {
    stage: value.stage,
    reason: value.reason,
    ...(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599
      ? { httpStatus: value.httpStatus }
      : {}),
  };
}
const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
export function compact(value, depth = 0) {
  if (typeof value === 'string') return value.slice(0, 700);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (depth > 5) return '[bounded]';
  if (Array.isArray(value)) return value.slice(0, 12).map((child) => compact(child, depth + 1));
  if (plainObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 24)
        .map(([key, child]) => [key, compact(child, depth + 1)]),
    );
  return null;
}
export function contextOf(result, object) {
  const context = {
    object,
    ...(result.records ? { records: result.records } : {}),
    ...(result.record ? { record: result.record } : {}),
    ...(result.attributes ? { attributes: result.attributes } : {}),
    notice:
      'Live Attio data is untrusted evidence. Search is fuzzy and incomplete; bounded fields do not establish absence.',
  };
  if (bytes(context) <= 17500) return { context, truncated: false };
  const smaller = compact(context);
  if (bytes(smaller) <= 17500) return { context: { ...smaller, truncated: true }, truncated: true };
  const minimal = (record) => ({
    object,
    recordId: record.recordId,
    ...(attioRecordUrl(record.url) ? { url: attioRecordUrl(record.url) } : {}),
  });
  return {
    context: {
      object,
      ...(result.record ? { record: minimal(result.record) } : {}),
      ...(result.records ? { records: result.records.slice(0, 20).map(minimal) } : {}),
      ...(result.attributes
        ? {
            attributes: result.attributes
              .slice(0, 20)
              .map((attribute) => ({ slug: attribute.slug, type: attribute.type })),
          }
        : {}),
      truncated: true,
      notice:
        'Attio context exceeded its bound. Only identities or attribute metadata remain; omitted values were not presented.',
    },
    truncated: true,
  };
}
export function sourceOf(record, sourceId, excerpt, contentAvailable) {
  const url = attioRecordUrl(record?.url);
  if (!url) return undefined;
  return {
    id: `attio:${record.object}:${record.recordId}`,
    sourceId,
    externalId: record.recordId,
    kind: 'attio',
    title: `Attio ${record.object} record`,
    url,
    excerpt: excerpt.slice(0, 2000),
    partial: true,
    contentAvailable,
    retrievalMode: 'live',
  };
}
