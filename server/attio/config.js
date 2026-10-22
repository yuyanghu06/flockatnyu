import { SOURCE_TOOL_TIMEOUT_MS } from '../source-timeout.js';
import { validUuid } from '../automation/validation.js';

// Server only: the bearer token must never be serialized into a response.
export const validAttioSlug = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) && !/[\r\n]/.test(value)
  && !['__proto__', 'prototype', 'constructor'].includes(value);

export function readAttioConfig(env = process.env) {
  const value = key => typeof env[key] === 'string' ? env[key].trim() : '';
  const token = value('ATTIO_API_TOKEN');
  const sourceId = value('ATTIO_SOURCE_ID');
  const rawObjects = value('ATTIO_ALLOWED_OBJECTS');
  const objects = rawObjects.split(',').map(object => object.trim());
  const allowedObjects = rawObjects && objects.length <= 32 && objects.every(validAttioSlug) ? [...new Set(objects)] : [];
  const rawTimeout = value('ATTIO_TIMEOUT_MS');
  const timeoutMs = /^\d+$/.test(rawTimeout) && Number(rawTimeout) >= 100 && Number(rawTimeout) <= 300000 ? Number(rawTimeout) : SOURCE_TOOL_TIMEOUT_MS;
  return Object.freeze({ token, sourceId, allowedObjects: Object.freeze(allowedObjects), timeoutMs,
    writesEnabled: value('ATTIO_WRITES_ENABLED') === 'true',
    configured: Boolean(token && !/[\r\n]/.test(token) && validUuid(sourceId) && allowedObjects.length) });
}
