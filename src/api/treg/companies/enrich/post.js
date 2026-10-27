/**
 * POST /api/treg/companies/enrich
 *
 * Why: Look up company details separately from people enrichment when a future caller
 * explicitly enables it.
 * Inputs: JSON exactly {requestId:UUID, input}; no query; <=8192 bytes and <=10 s
 * bounded read. At least one domain, website, name, linkedin_url, linkedin_handle or
 * actual email is required. The existing shared validator rejects unknown, blank,
 * oversized or malformed identifiers.
 * Access: DORMANT: not mounted or reachable in production (404 there). Isolated
 * registration requires authenticated actor ID<=512/allowedSourceIds and exact same
 * Origin; cross-site rejected.
 * Service and effects: When deliberately mounted, tregLookupClient.lookup uses the
 * configured fixed company provider through Treg with requestId, principal, request
 * signal and required private logging. No fallback, polling, Contacts/cache write or
 * other-service operation is added by this route.
 * Response and failure: 200 ready/hasResult/output/usage
 * (name/domain/website/description/industry/employees/location/linkedin_url/founded;
 * employees text/null); 202 pending.400 invalid, 403 forbidden, 402 budget, 408 aborted,
 * 429 rate limit, 502 invalid/oversized, 503 config/log/unavailable. Null miss and
 * pending are honest outcomes; native provider bodies stay private. Private no-store,
 * nosniff.
 */
import { plainObject, validUuid } from '../../../../../server/automation/validation.js';
import { validTregLookupInput } from '../../../../../server/treg-lookups.js';
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
