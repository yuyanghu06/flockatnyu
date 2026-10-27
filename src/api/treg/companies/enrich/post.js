/**
 * POST /api/treg/companies/enrich
 *
 * Why: Reserve a company-detail lookup for a future explicitly enabled caller,
 * separately from people discovery and enrichment. This handler is DORMANT:
 * the running app never registers it, so the production path returns 404.
 * Inputs: JSON exactly {requestId: UUID, input}, no query, <=8192 bytes and a
 * <=10-second bounded body read. Every supplied field is validated. Select one
 * identifier in order: domain, website hostname, actual email, company name.
 * A selected name needs at least three characters. LinkedIn-only input fails;
 * a valid extra LinkedIn field is unused alongside a supported selector.
 * Access: Optional registration requires an authenticated actor ID <=512 chars,
 * an allowedSourceIds array and exact same Origin. Cross-site requests fail.
 * Services/effects: tregLookupClient.lookup makes one fixed native Brand.dev GET
 * through Treg: retrieve for domain/website, retrieve-by-email or retrieve-by-name.
 * Website hostnames are extracted locally; the app never fetches that website.
 * The client forwards the request signal, private configuration, cost ceiling and
 * actor/operation/input/request-ID idempotency. Required private logs retain the
 * bounded native response, with credentials removed. No fallback, polling,
 * Contacts/cache write or other-service operation occurs.
 * Response/status: 200 ready/hasResult/output/usage; 202 pending; 400 invalid,
 * 403 forbidden, 402 budget, 408 aborted, 429 rate limit, 502 invalid/oversized,
 * 503 config/log/unavailable. Output allows supported name/domain/website,
 * description/industry/employees/location/linkedin_url/founded fields only;
 * employees remain text/null and provider-native bodies stay private. Misses and
 * pending are honest outcomes. Every response is private no-store and nosniff.
 */
import { plainObject, validUuid } from '../../../../../server/automation/validation.js';
import { validTregLookupInput } from '../../../../../server/treg/lookups.js';
import { statuses, projectResult } from '../../../_shared/treg-lookups.js';
export function registerApiTregCompaniesEnrichPost({
  app,
  tregLookupClient,
  auth,
  config,
  readJSON,
} = {}) {
  const operation = 'company_enrich';
  app.post('/api/treg/companies/enrich', async (c) => {
    c.header('cache-control', 'private, no-store');
    c.header('x-content-type-options', 'nosniff');
    const fail = (status) => c.json({ status }, statuses[status] || 503);
    const url = new URL(c.req.url),
      origin = c.req.header('origin');
    if (c.req.header('sec-fetch-site') === 'cross-site' || origin !== url.origin)
      return fail('forbidden');
    let principal;
    try {
      principal = await auth(c, config);
    } catch {
      return fail('forbidden');
    }
    if (
      typeof principal?.id !== 'string' ||
      !principal.id.trim() ||
      principal.id.length > 512 ||
      !Array.isArray(principal.allowedSourceIds)
    )
      return fail('forbidden');
    if (url.search) return fail('invalid_request');
    let body;
    try {
      body = await readJSON(c.req.raw, Math.min(config?.timeoutMs || 10000, 10000), 8192);
    } catch {
      return fail('invalid_request');
    }
    if (
      !plainObject(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, 'requestId') ||
      !Object.hasOwn(body, 'input') ||
      !validUuid(body.requestId) ||
      !validTregLookupInput(operation, body.input)
    )
      return fail('invalid_request');
    if (!tregLookupClient?.configured || typeof tregLookupClient.lookup !== 'function')
      return fail('not_configured');
    try {
      const result = await tregLookupClient.lookup({
        operation,
        input: body.input,
        requestId: body.requestId,
        principal,
        signal: c.req.raw.signal,
      });
      if (result?.status === 'ready' || result?.status === 'pending') {
        const projected = projectResult(result, operation);
        return projected ? c.json(projected, statuses[projected.status]) : fail('invalid_response');
      }
      return fail(Object.hasOwn(statuses, result?.status) ? result.status : 'unavailable');
    } catch {
      return fail('unavailable');
    }
  });
}
