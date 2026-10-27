import { contactFields } from '../contacts/fields.js';
import { plainObject, validUuid } from '../automation/validation.js';
import { validContact } from '../contacts/store.js';
import { actorAllowed, label, personLimit, validTregPeopleQuery } from './validation.js';
import { tregContactIdentity } from './contact-identity.js';

const project = (contact) => ({
  id: contact.id,
  created_at: contact.created_at,
  updated_at: contact.updated_at,
  fields: contactFields(contact),
});

// User-requested import workflow: one Treg search, then insert-only contact
// writes. It is not exposed as a compound agent tool or called by plain reads.
export function createTregContactsImporter({ client, contactsStore } = {}) {
  const configured =
    client?.configured === true &&
    typeof client.search === 'function' &&
    contactsStore?.configured === true &&
    typeof contactsStore.importContact === 'function';
  return Object.freeze({
    configured,
    async importPeople({ query, requestId, principal, signal } = {}) {
      if (!actorAllowed(principal)) return { status: 'forbidden' };
      if (!validTregPeopleQuery(query) || !validUuid(requestId))
        return { status: 'invalid_request' };
      if (!configured) return { status: 'not_configured' };
      let found;
      try {
        found = await client.search({ query, requestId, principal, signal });
      } catch {
        return { status: 'unavailable' };
      }
      const attempts = [];
      async function finish(result) {
        if (!found?.callLog) return result;
        let logged = false;
        try {
          logged =
            (await found.callLog.append('import_outcome', { ...result, attempts }))?.status ===
            'ready';
        } catch {}
        return {
          ...result,
          logging: {
            status:
              logged &&
              found.logging?.status !== 'log_unavailable' &&
              found.status !== 'log_unavailable'
                ? 'ready'
                : 'log_unavailable',
            logId: found.callLog.logId,
          },
        };
      }
      if (found?.status !== 'ready')
        return finish({
          status: [
            'forbidden',
            'invalid_request',
            'not_configured',
            'aborted',
            'rate_limited',
            'budget_exceeded',
            'response_too_large',
            'invalid_response',
            'log_unavailable',
          ].includes(found?.status)
            ? found.status
            : 'unavailable',
        });
      if (
        !Array.isArray(found.people) ||
        found.people.length > (query.limit ?? 5) ||
        !plainObject(found.usage) ||
        !label(found.usage.provider) ||
        !(found.usage.callId === null || label(found.usage.callId)) ||
        !(
          found.usage.costMicro === null ||
          (Number.isSafeInteger(found.usage.costMicro) && found.usage.costMicro >= 0)
        ) ||
        found.people.some(
          (person) =>
            !plainObject(person) || Buffer.byteLength(JSON.stringify(person)) > personLimit,
        )
      )
        return finish({ status: 'invalid_response' });
      let planned;
      try {
        planned = found.people.map((person) => {
          const identity = tregContactIdentity(person, found.usage.provider);
          return {
            person,
            normalized: { contactId: identity.contactId, fields: { email: identity.email } },
          };
        });
      } catch {
        return finish({ status: 'invalid_response' });
      }
      const result = {
        status: 'ready',
        imported: 0,
        existing: 0,
        skipped: 0,
        contacts: [],
        usage: found.usage,
      };
      const seen = new Set();
      for (const [inputIndex, { person, normalized }] of planned.entries()) {
        if (!normalized || seen.has(normalized.contactId)) {
          attempts.push({
            inputIndex,
            requestedContactId: normalized?.contactId ?? null,
            status: 'skipped',
            reason: 'duplicate_input',
          });
          result.skipped++;
          continue;
        }
        seen.add(normalized.contactId);
        if (signal?.aborted) {
          attempts.push({
            inputIndex,
            requestedContactId: normalized.contactId,
            status: 'not_attempted',
            reason: 'aborted',
          });
          return finish({ ...result, status: 'partial', reason: 'aborted' });
        }
        const attempt = {
          inputIndex,
          requestedContactId: normalized.contactId,
          status: 'attempted',
        };
        attempts.push(attempt);
        let saved;
        try {
          saved = await contactsStore.importContact({
            contactId: normalized.contactId,
            rawInput: structuredClone(person),
            email: normalized.fields.email,
            signal,
          });
        } catch {
          saved = { status: 'unavailable', reason: 'write_outcome_unknown' };
        }
        if (
          saved?.status !== 'ready' ||
          !validContact(saved.contact) ||
          !['imported', 'existing'].includes(saved.operation) ||
          (saved.operation === 'imported' &&
            saved.contact.id.toLowerCase() !== normalized.contactId.toLowerCase())
        ) {
          const reason =
            saved?.reason === 'write_outcome_unknown' || saved?.status === 'ready'
              ? 'write_outcome_unknown'
              : ['aborted', 'not_configured', 'conflict', 'forbidden', 'rate_limited'].includes(
                    saved?.status,
                  )
                ? saved.status
                : 'storage_unavailable';
          Object.assign(attempt, {
            status: 'failed',
            reason,
            uncertain: reason === 'write_outcome_unknown',
          });
          return finish({ ...result, status: 'partial', reason });
        }
        Object.assign(attempt, {
          status: 'confirmed',
          operation: saved.operation,
          confirmedContactId: saved.contact.id,
        });
        result[saved.operation]++;
        result.contacts.push(project(saved.contact));
      }
      return finish(result);
    },
  });
}
