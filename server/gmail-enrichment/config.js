import { validUuid } from '../automation/validation.js';
import { readDailyTregConfig } from './treg.js';

export const validEnrichmentEmail = value => typeof value === 'string' && value.length <= 320
  && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
const integer = (value, fallback, min, max) => {
  if (value === undefined || value === '') return fallback;
  return /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
};
const money = (value, fallback) => {
  const text = value === undefined || value === '' ? fallback : value;
  return typeof text === 'string' && /^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(text)
    && Number.isSafeInteger(Math.round(Number(text) * 1e6)) && Number(text) > 0 && Number(text) <= 100
    ? Math.round(Number(text) * 1e6) : null;
};

// Source/account scope is an explicit worker setting, never derived from mail
// text or another service's currently queued originals.
export function readGmailEnrichmentConfig(env = process.env) {
  const account = typeof env.GMAIL_ENRICHMENT_ACCOUNT === 'string' ? env.GMAIL_ENRICHMENT_ACCOUNT.trim().toLowerCase() : '';
  const sourceIds = typeof env.GMAIL_ENRICHMENT_SOURCE_IDS === 'string' ? env.GMAIL_ENRICHMENT_SOURCE_IDS.split(',').map(value => value.trim()) : [];
  const batchSize = integer(env.GMAIL_ENRICHMENT_BATCH_SIZE, 50, 1, 50);
  const maxRequests = integer(env.GMAIL_ENRICHMENT_MAX_REQUESTS, 50, 1, 100);
  const maxItems = integer(env.GMAIL_ENRICHMENT_MAX_ITEMS, 50, 1, 100);
  const pollMs = integer(env.GMAIL_ENRICHMENT_POLL_MS, 5000, 1000, 300000);
  const leaseSeconds = integer(env.GMAIL_ENRICHMENT_LEASE_SECONDS, 120, 90, 600);
  const maxCycleCostMicro = money(env.GMAIL_ENRICHMENT_MAX_CYCLE_COST_USD, '0.50');
  const maxDailyCostMicro = money(env.GMAIL_ENRICHMENT_MAX_DAILY_COST_USD, '1.00');
  const treg = readDailyTregConfig(env);
  const perCallMaxCostMicro = treg.maxCostUsd ? Math.round(Number(treg.maxCostUsd) * 1e6) : null;
  const configured = validEnrichmentEmail(account) && sourceIds.length > 0 && sourceIds.length <= 100
    && sourceIds.every(validUuid) && new Set(sourceIds.map(id => id.toLowerCase())).size === sourceIds.length
    && batchSize !== null && maxRequests !== null && maxItems !== null && pollMs !== null && leaseSeconds !== null
    && maxCycleCostMicro !== null && maxDailyCostMicro !== null && perCallMaxCostMicro !== null
    && maxCycleCostMicro >= perCallMaxCostMicro && maxDailyCostMicro >= maxCycleCostMicro;
  return Object.freeze({ enabled: env.GMAIL_ENRICHMENT_ENABLED === 'true', configured,
    account, sourceIds: Object.freeze(sourceIds.map(id => id.toLowerCase())), scope: 'sender',
    batchSize, maxRequests, maxItems, pollMs, leaseSeconds, maxCycleCostMicro, maxDailyCostMicro, perCallMaxCostMicro });
}
