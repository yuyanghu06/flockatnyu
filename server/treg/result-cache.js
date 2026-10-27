import { randomUUID } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { tregContactIdentity } from './people.js';
import { validTregEnrichmentEmail } from './enrich.js';

// This short-lived bridge holds already observed Treg people, never fetches a
// service, and is discarded with the chat run. Only opaque references leave it.
export function createTregResultCache({ principal } = {}) {
  const actor =
    typeof principal?.id === 'string' &&
    principal.id.trim() &&
    Array.isArray(principal.allowedSourceIds)
      ? canonicalJson({ id: principal.id, allowedSourceIds: principal.allowedSourceIds })
      : null;
  const entries = new Map();
  let bytes = 0;
  const allowed = (value) => {
    if (!actor || typeof value?.id !== 'string' || !Array.isArray(value.allowedSourceIds))
      return false;
    try {
      return canonicalJson({ id: value.id, allowedSourceIds: value.allowedSourceIds }) === actor;
    } catch {
      return false;
    }
  };
  return Object.freeze({
    registerMany({ principal: supplied, people } = {}) {
      if (
        !allowed(supplied) ||
        !Array.isArray(people) ||
        !people.length ||
        entries.size + people.length > 100
      )
        return null;
      const planned = [];
      let added = 0;
      try {
        for (const person of people) {
          if (
            !plainObject(person.rawInput) ||
            typeof person.provider !== 'string' ||
            (person.lookupEmail !== undefined && !validTregEnrichmentEmail(person.lookupEmail)) ||
            typeof person.appendLog !== 'function'
          )
            return null;
          const encoded = canonicalJson(person.rawInput),
            size = Buffer.byteLength(encoded);
          if (size > 200000) return null;
          const identity = tregContactIdentity(
            person.rawInput,
            person.provider,
            person.lookupEmail,
          );
          planned.push({
            ...identity,
            rawInput: JSON.parse(encoded),
            appendLog: person.appendLog,
            resultId: randomUUID(),
          });
          added += size;
        }
      } catch {
        return null;
      }
      if (bytes + added > 2000000) return null;
      for (const person of planned) entries.set(person.resultId, person);
      bytes += added;
      return planned.map((person) => person.resultId);
    },
    resolve({ principal: supplied, resultIds } = {}) {
      if (
        !allowed(supplied) ||
        !Array.isArray(resultIds) ||
        resultIds.length < 1 ||
        resultIds.length > 10 ||
        resultIds.some((id) => !validUuid(id) || !entries.has(id.toLowerCase()))
      )
        return null;
      return resultIds.map((id) => {
        const person = entries.get(id.toLowerCase());
        return { ...person, rawInput: structuredClone(person.rawInput) };
      });
    },
  });
}
