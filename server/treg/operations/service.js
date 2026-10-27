import { randomUUID } from 'node:crypto';
import { canonicalJson, plainObject, validateArguments } from '../../automation/validation.js';

import { validTregPeopleQuery } from '../people.js';
import { validTregEnrichmentEmail } from '../enrich.js';
import { TREG_TOOLS } from './schema.js';
import { projectTregUsage, projectTregFields } from './projections.js';
const failures = new Set([
  'forbidden',
  'invalid_request',
  'not_configured',
  'aborted',
  'rate_limited',
  'budget_exceeded',
  'response_too_large',
  'invalid_response',
  'log_unavailable',
  'unavailable',
]);
const failure = (status) => ({
  status: failures.has(status) ? status : 'unavailable',
  sources: [],
  coverage: { complete: false },
});
const authorized = (principal) =>
  typeof principal?.id === 'string' &&
  Boolean(principal.id.trim()) &&
  principal.id.length <= 512 &&
  Array.isArray(principal.allowedSourceIds) &&
  principal.allowedSourceIds.every((value) => typeof value === 'string');
const copy = (value) => JSON.parse(JSON.stringify(value));
export function createTregOperationService({ peopleClient, enrichmentClient } = {}) {
  const configured = peopleClient?.configured === true || enrichmentClient?.configured === true;
  function createRequest({ principal, tregResults } = {}) {
    const actor = authorized(principal)
      ? { id: principal.id, allowedSourceIds: [...principal.allowedSourceIds] }
      : null;
    const searches = new Map(),
      emails = new Map();
    function validate(name, args, suppliedActor) {
      const tool = TREG_TOOLS.find((value) => value.name === name);
      if (
        !tool ||
        !validateArguments(args, tool.parameters) ||
        (name === 'search_treg_people' && !validTregPeopleQuery(args)) ||
        (name === 'enrich_treg_people' && !args.emails.every(validTregEnrichmentEmail))
      )
        return failure('invalid_request');
      if (
        !actor ||
        (suppliedActor !== undefined &&
          (!authorized(suppliedActor) ||
            suppliedActor.id !== actor.id ||
            canonicalJson(suppliedActor.allowedSourceIds) !==
              canonicalJson(actor.allowedSourceIds)))
      )
        return failure('forbidden');
      const client = name === 'search_treg_people' ? peopleClient : enrichmentClient;
      if (
        client?.configured !== true ||
        typeof client[name === 'search_treg_people' ? 'search' : 'enrich'] !== 'function'
      )
        return failure('not_configured');
      return null;
    }
    async function finish(found, outcome) {
      // Completion is private and records explicitly that nothing was saved.
      if (!found?.callLog && !found?.finishLog) return found?.status !== 'ready';
      let logged = false;
      try {
        logged =
          typeof found.finishLog === 'function'
            ? (await found.finishLog({ ...outcome, saved: false, operation: 'lookup_only' }))
                ?.status === 'ready'
            : (
                await found.callLog.append('lookup_outcome', {
                  ...outcome,
                  saved: false,
                  operation: 'lookup_only',
                })
              )?.status === 'ready';
      } catch {
        /* Raw logging exceptions never reach chat. */
      }
      return (
        logged && found.status !== 'log_unavailable' && found.logging?.status !== 'log_unavailable'
      );
    }
    const appendFor = (found) => async (outcome) => {
      try {
        const result =
          typeof found.finishLog === 'function'
            ? await found.finishLog(outcome)
            : await found.callLog?.append('import_outcome', outcome);
        return result?.status === 'ready';
      } catch {
        return false;
      }
    };
    async function search(query, signal) {
      let found;
      try {
        found = await peopleClient.search({
          query,
          requestId: randomUUID(),
          principal: actor,
          signal,
        });
      } catch {
        return failure(signal?.aborted ? 'aborted' : 'unavailable');
      }
      let output;
      if (found?.status !== 'ready') output = failure(found?.status);
      else if (
        !Array.isArray(found.people) ||
        found.people.length > query.limit ||
        found.people.some((person) => !plainObject(person)) ||
        !projectTregUsage(found.usage)
      )
        output = failure('invalid_response');
      else
        output = {
          status: 'ready',
          sources: [],
          people: found.people.map((person) => ({ fields: projectTregFields(person) })),
          usage: projectTregUsage(found.usage),
          coverage: {
            complete: false,
            returnedCount: found.people.length,
            scope: 'external_people_search',
          },
        };
      if (Buffer.byteLength(JSON.stringify(output)) > 60000) output = failure('response_too_large');
      if (
        !(await finish(found, { status: output.status, returnedCount: output.people?.length ?? 0 }))
      )
        return failure('log_unavailable');
      if (output.status === 'ready' && output.people.length && tregResults) {
        const ids = tregResults.registerMany({
          principal: actor,
          people: found.people.map((rawInput) => ({
            rawInput,
            provider: found.usage.provider,
            appendLog: appendFor(found),
          })),
        });
        if (!ids) return failure('response_too_large');
        output.people = output.people.map((person, index) => ({ ...person, resultId: ids[index] }));
      }
      return output;
    }
    async function enrich(email, signal) {
      let found;
      try {
        found = await enrichmentClient.enrich({
          email,
          requestId: randomUUID(),
          principal: actor,
          signal,
        });
      } catch {
        return { status: signal?.aborted ? 'aborted' : 'unavailable' };
      }
      let output;
      if (found?.status !== 'ready') output = { status: failure(found?.status).status };
      else if (
        typeof found.matched !== 'boolean' ||
        !plainObject(found.enrichment?.output) ||
        !projectTregUsage(found.usage)
      )
        output = { status: 'invalid_response' };
      else
        output = {
          status: 'ready',
          matched: found.matched,
          fields: found.matched ? projectTregFields(found.enrichment.output) : {},
          usage: projectTregUsage(found.usage),
        };
      if (Buffer.byteLength(JSON.stringify(output)) > 5500)
        output = { status: 'response_too_large' };
      if (
        output.status === 'ready' &&
        output.matched &&
        tregResults &&
        !plainObject(found.enrichment.raw)
      )
        output = { status: 'invalid_response' };
      if (
        !(await finish(found, {
          status: output.status,
          ...(typeof output.matched === 'boolean' ? { matched: output.matched } : {}),
        }))
      )
        return { status: 'log_unavailable' };
      if (output.status === 'ready' && output.matched && tregResults) {
        const ids = tregResults.registerMany({
          principal: actor,
          people: [
            {
              rawInput: found.enrichment.raw,
              lookupEmail: email,
              provider: found.usage.provider,
              appendLog: appendFor(found),
            },
          ],
        });
        if (!ids) return { status: 'response_too_large' };
        output.resultId = ids[0];
      }
      return output;
    }
    async function execute({ name, arguments: args, principal: suppliedActor, signal } = {}) {
      const invalid = validate(name, args, suppliedActor);
      if (invalid) return invalid;
      if (signal?.aborted) return failure('aborted');
      if (name === 'search_treg_people') {
        const query = { ...copy(args), limit: args.limit ?? 5 },
          key = canonicalJson(query);
        if (!searches.has(key)) searches.set(key, search(query, signal));
        return copy(await searches.get(key));
      }
      // Validate the entire batch above, before the first billable request.
      const results = [];
      for (const email of args.emails) {
        const key = email.toLowerCase();
        if (!emails.has(key)) {
          if (signal?.aborted) {
            results.push({ email, status: 'aborted' });
            continue;
          }
          emails.set(key, enrich(key, signal));
        }
        results.push({ email, ...copy(await emails.get(key)) });
      }
      const ready = results.filter((result) => result.status === 'ready').length;
      return {
        status:
          ready === results.length
            ? 'ready'
            : ready
              ? 'partial'
              : results.every((result) => result.status === results[0].status)
                ? results[0].status
                : 'unavailable',
        results,
        sources: [],
        coverage: {
          complete: ready === results.length,
          returnedCount: results.length,
          scope: 'email_enrichment',
        },
      };
    }
    return Object.freeze({ configured, tools: TREG_TOOLS, execute });
  }
  // Direct authenticated HTTP calls receive one fresh operation scope. Chat
  // explicitly binds a reusable scope for all tool calls in that conversation run.
  const execute = (input) => createRequest({ principal: input?.principal }).execute(input);
  return Object.freeze({ configured, tools: TREG_TOOLS, createRequest, execute });
}
