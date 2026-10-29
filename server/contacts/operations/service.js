import { contactFields } from '../fields.js';
import { canonicalJson, validateArguments, validUuid } from '../../automation/validation.js';
import { validContact, validContactFields } from '../store.js';
import { validContactSummary } from '../summary.js';

import { CONTACT_TOOLS } from './schema.js';
const methods = {
  search_contacts: 'search',
  read_contact: 'read',
  create_contact: 'create',
  update_contact: 'update',
  delete_contact: 'delete',
  import_treg_contacts: 'importContact',
};
const writes = new Set([
  'create_contact',
  'update_contact',
  'delete_contact',
  'import_treg_contacts',
]);
const failure = (status, reason) => ({ status, sources: [], ...(reason ? { reason } : {}) });
const authorized = (principal) =>
  typeof principal?.id === 'string' &&
  Boolean(principal.id.trim()) &&
  Array.isArray(principal.allowedSourceIds);
const validStamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const statuses = new Set([
  'not_configured',
  'forbidden',
  'invalid_request',
  'aborted',
  'schema_not_ready',
  'conflict',
  'not_found',
  'rate_limited',
  'unavailable',
  'invalid_response',
  'response_too_large',
]);
const copy = (value) => JSON.parse(JSON.stringify(value));
const contactOf = (value) => ({
  id: value.id,
  created_at: value.created_at,
  updated_at: value.updated_at,
  raw_input: contactFields(value),
});
export function createContactsOperationService({ store } = {}) {
  function validate(name, args, principal) {
    const tool = CONTACT_TOOLS.find((tool) => tool.name === name);
    if (
      !tool ||
      !validateArguments(args, tool.parameters) ||
      (args.contactId !== undefined && !validUuid(args.contactId)) ||
      (args.expectedUpdatedAt !== undefined && !validStamp(args.expectedUpdatedAt)) ||
      (args.fields !== undefined &&
        !validContactFields(args.fields, { create: name === 'create_contact' })) ||
      (args.resultIds !== undefined && !args.resultIds.every(validUuid))
    )
      return failure('invalid_request');
    if (!authorized(principal)) return failure('forbidden');
    if (!store?.configured || typeof store[methods[name]] !== 'function')
      return failure('not_configured');
    return null;
  }
  async function perform({ name, args, principal, signal, snapshot, captureSnapshot }) {
    const invalid = validate(name, args, principal);
    if (invalid) return invalid;
    const mutation = writes.has(name);
    if (
      ['update_contact', 'delete_contact'].includes(name) &&
      (!validContact(snapshot) ||
        snapshot.id.toLowerCase() !== args.contactId.toLowerCase() ||
        snapshot.updated_at !== args.expectedUpdatedAt)
    )
      return failure('read_required');
    try {
      const callArgs =
        name === 'update_contact'
          ? {
              contactId: args.contactId,
              expectedUpdatedAt: args.expectedUpdatedAt,
              rawInput: { ...snapshot.raw_input, ...args.fields },
              signal,
            }
          : { ...args, signal };
      const result = await store[methods[name]](callArgs);
      if (result?.status !== 'ready')
        return failure(
          statuses.has(result?.status) ? result.status : 'unavailable',
          result?.reason === 'write_outcome_unknown' ||
            (mutation &&
              (!statuses.has(result?.status) ||
                ['invalid_response', 'response_too_large'].includes(result.status)))
            ? 'write_outcome_unknown'
            : undefined,
        );
      if (name === 'search_contacts') {
        if (
          !Array.isArray(result.contacts) ||
          result.contacts.length > (args.limit ?? 5) ||
          result.contacts.some((contact) => !validContactSummary(contact)) ||
          typeof result.coverage?.complete !== 'boolean' ||
          !(
            result.coverage.nextOffset === null ||
            (Number.isSafeInteger(result.coverage.nextOffset) &&
              result.coverage.nextOffset > (args.offset ?? 0) &&
              result.coverage.nextOffset <= 10000)
          )
        )
          return failure('invalid_response');
        return {
          status: 'ready',
          contacts: result.contacts.map((contact) => ({
            id: contact.id,
            created_at: contact.created_at,
            updated_at: contact.updated_at,
            raw_input: { ...contact.fields },
          })),
          coverage: { complete: result.coverage.complete, nextOffset: result.coverage.nextOffset },
          sources: [],
        };
      }
      if (
        !validContact(result.contact) ||
        (args.contactId && result.contact.id.toLowerCase() !== args.contactId.toLowerCase())
      )
        return failure('invalid_response', mutation ? 'write_outcome_unknown' : undefined);
      if (name === 'read_contact') captureSnapshot?.(copy(result.contact));
      return {
        status: 'ready',
        contact: contactOf(result.contact),
        sources: [],
        ...(mutation
          ? {
              contactWrite: {
                operation:
                  name === 'create_contact'
                    ? 'created'
                    : name === 'update_contact'
                      ? 'updated'
                      : 'deleted',
                id: result.contact.id,
                updated_at: result.contact.updated_at,
              },
            }
          : {}),
      };
    } catch {
      return failure(
        mutation ? 'unavailable' : signal?.aborted ? 'aborted' : 'unavailable',
        mutation ? 'write_outcome_unknown' : undefined,
      );
    }
  }
  const execute = ({ name, arguments: args, principal, signal } = {}) =>
    name === 'import_treg_contacts'
      ? failure('forbidden', 'current_request_results_required')
      : perform({ name, args, principal, signal });
  function createRequest({ principal, userMessage, tregResults } = {}) {
    const actor = {
      id: principal?.id,
      allowedSourceIds: Array.isArray(principal?.allowedSourceIds)
        ? [...principal.allowedSourceIds]
        : undefined,
    };
    const userAuthorized = typeof userMessage === 'string' && Boolean(userMessage.trim());
    const snapshots = new Map(),
      receipts = new Map(),
      imports = new Map();
    let importQueue = Promise.resolve();
    let uncertain = false,
      logBlocked = false,
      revision = 0;
    async function importOne(person, signal) {
      if (logBlocked) return { resultId: person.resultId, ...failure('log_unavailable') };
      if (uncertain)
        return { resultId: person.resultId, ...failure('unavailable', 'write_outcome_unknown') };
      if (signal?.aborted) return { resultId: person.resultId, ...failure('aborted') };
      const outcome = {
        resultId: person.resultId,
        requestedContactId: person.contactId,
        operation: 'contact_import',
      };
      if (!(await person.appendLog({ ...outcome, status: 'attempted', saved: false }))) {
        logBlocked = true;
        return { resultId: person.resultId, ...failure('log_unavailable') };
      }
      if (signal?.aborted) {
        if (!(await person.appendLog({ ...outcome, status: 'aborted', saved: false })))
          logBlocked = true;
        return { resultId: person.resultId, ...failure('aborted') };
      }
      let result;
      try {
        result = await store.importContact({
          contactId: person.contactId,
          rawInput: person.rawInput,
          email: person.email,
          ...(person.lookupEmail ? { lookupEmail: person.lookupEmail } : {}),
          signal,
        });
      } catch {
        result = { status: 'unavailable', reason: 'write_outcome_unknown' };
      }
      const confirmed =
        result?.status === 'ready' &&
        validContact(result.contact) &&
        ['imported', 'existing'].includes(result.operation) &&
        (result.operation !== 'imported' ||
          (result.contact.id.toLowerCase() === person.contactId.toLowerCase() &&
            canonicalJson(result.contact.raw_input) === canonicalJson(person.rawInput) &&
            (!person.lookupEmail || result.contact.lookup_email === person.lookupEmail)));
      if (!confirmed) {
        const unknown =
          result?.reason === 'write_outcome_unknown' ||
          result?.status === 'ready' ||
          !statuses.has(result?.status) ||
          ['invalid_response', 'response_too_large'].includes(result?.status);
        if (unknown) uncertain = true;
        const failed = failure(
          statuses.has(result?.status) ? result.status : 'unavailable',
          unknown ? 'write_outcome_unknown' : undefined,
        );
        if (
          !(await person.appendLog({
            ...outcome,
            status: failed.status,
            saved: false,
            ...(unknown ? { uncertain: true } : {}),
          }))
        )
          logBlocked = true;
        return { resultId: person.resultId, ...failed };
      }
      const logged = await person.appendLog({
        ...outcome,
        status: 'confirmed',
        saved: result.operation === 'imported',
        importOperation: result.operation,
        confirmedContactId: result.contact.id,
        updated_at: result.contact.updated_at,
      });
      if (!logged) logBlocked = true;
      return {
        resultId: person.resultId,
        status: 'ready',
        operation: result.operation,
        contact: contactOf(result.contact),
        ...(!logged ? { logging: 'log_unavailable' } : {}),
      };
    }
    async function importPeople(args, signal) {
      const people = tregResults?.resolve({ principal: actor, resultIds: args.resultIds });
      if (!people) return failure('invalid_request', 'current_request_results_required');
      const results = [];
      for (const person of people) {
        if (!imports.has(person.resultId)) {
          const pending = importQueue.then(() => importOne(person, signal));
          importQueue = pending.then(
            () => undefined,
            () => undefined,
          );
          imports.set(person.resultId, pending);
        }
        results.push(copy(await imports.get(person.resultId)));
      }
      const unique = [
        ...new Map(
          results
            .filter((result) => result.status === 'ready')
            .map((result) => [result.resultId, result]),
        ).values(),
      ];
      const complete = results.every((result) => result.status === 'ready' && !result.logging);
      return {
        status: complete ? 'ready' : unique.length ? 'partial' : results[0].status,
        ...(results.some((result) => result.reason === 'write_outcome_unknown')
          ? { reason: 'write_outcome_unknown' }
          : {}),
        results,
        sources: [],
        contactImport: {
          complete,
          imported: unique.filter((result) => result.operation === 'imported').length,
          existing: unique.filter((result) => result.operation === 'existing').length,
          items: unique.map((result) => ({
            resultId: result.resultId,
            operation: result.operation,
            id: result.contact.id,
            updated_at: result.contact.updated_at,
          })),
        },
      };
    }
    async function requestExecute({
      name,
      arguments: args,
      principal: suppliedActor,
      signal,
    } = {}) {
      if (
        suppliedActor !== undefined &&
        (!authorized(suppliedActor) ||
          suppliedActor.id !== actor.id ||
          canonicalJson(suppliedActor.allowedSourceIds) !== canonicalJson(actor.allowedSourceIds))
      )
        return failure('forbidden');
      const invalid = validate(name, args, actor);
      if (invalid) return invalid;
      if (name === 'import_treg_contacts') {
        if (!userAuthorized) return failure('forbidden', 'current_user_instruction_required');
        return importPeople(args, signal);
      }
      const target = args.contactId?.toLowerCase();
      if (!writes.has(name)) {
        if (name === 'read_contact') snapshots.delete(target);
        const result = await perform({
          name,
          args,
          principal: actor,
          signal,
          captureSnapshot: (contact) => snapshots.set(target, contact),
        });
        return result;
      }
      if (!userAuthorized) return failure('forbidden', 'current_user_instruction_required');
      if (logBlocked) return failure('log_unavailable');
      const key = `${name}:${name === 'create_contact' ? 0 : revision}:${canonicalJson(args)}`;
      if (receipts.has(key)) return copy(await receipts.get(key));
      if (uncertain) return failure('unavailable', 'write_outcome_unknown');
      const snapshot = snapshots.get(target);
      if (
        name !== 'create_contact' &&
        (!snapshot || snapshot.updated_at !== args.expectedUpdatedAt)
      )
        return failure('read_required');
      if (name !== 'create_contact') snapshots.delete(target);
      const captured = copy(args);
      const pending = perform({ name, args: captured, principal: actor, signal, snapshot }).then(
        (result) => {
          if (result.reason === 'write_outcome_unknown') uncertain = true;
          return result;
        },
      );
      receipts.set(key, pending);
      return copy(await pending);
    }
    return Object.freeze({
      configured: store?.configured === true,
      tools: Object.freeze(
        CONTACT_TOOLS.filter((tool) => userAuthorized || !writes.has(tool.name)),
      ),
      execute: requestExecute,
      advanceUserInput() {
        revision++;
      },
    });
  }
  return Object.freeze({
    configured: store?.configured === true,
    tools: CONTACT_TOOLS,
    execute,
    createRequest,
  });
}
