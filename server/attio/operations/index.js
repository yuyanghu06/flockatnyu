import {
  canonicalJson,
  plainObject,
  validateArguments,
  validUuid,
} from '../../automation/validation.js';
import { validAttioSlug } from '../config.js';
import { attioRecordUrl, validAttioValues } from '../client.js';
import { ATTIO_TOOLS } from './contracts.js';
import { safeDiagnostics, compact, contextOf, sourceOf } from './projection.js';

const methods = {
  search_attio_records: 'searchRecords',
  read_attio_record: 'readRecord',
  list_attio_attributes: 'listAttributes',
  create_attio_record: 'createRecord',
  update_attio_record: 'updateRecord',
};
const writes = new Set(['create_attio_record', 'update_attio_record']);
const failure = (status, reason) => ({
  status,
  sources: [],
  coverage: { complete: false },
  ...(reason ? { reason } : {}),
});
// Stateless execute is for the protected direct API. Chat must use createRequest.
export function createAttioOperations({ client, config = client?.config } = {}) {
  const sourceId = config?.sourceId ?? client?.sourceId;
  const allowedObjects = config?.allowedObjects ?? client?.allowedObjects ?? [];
  const writesEnabled = (config?.writesEnabled ?? client?.writesEnabled) === true;
  const tools = Object.freeze(
    ATTIO_TOOLS.filter((tool) => !writes.has(tool.name) || writesEnabled),
  );
  function authorized(principal, object) {
    return (
      typeof principal?.id === 'string' &&
      Boolean(principal.id.trim()) &&
      validUuid(sourceId) &&
      Array.isArray(principal.allowedSourceIds) &&
      principal.allowedSourceIds.includes(sourceId) &&
      validAttioSlug(object) &&
      allowedObjects.includes(object)
    );
  }
  function validate(name, args, principal) {
    const tool = ATTIO_TOOLS.find((tool) => tool.name === name);
    if (
      !tool ||
      !validateArguments(args, tool.parameters) ||
      !validAttioSlug(args.object) ||
      (args.recordId !== undefined && !validUuid(args.recordId)) ||
      (writes.has(name) && !validAttioValues(args.values))
    )
      return failure('invalid_request');
    if (!authorized(principal, args.object)) return failure('forbidden');
    if (writes.has(name) && !writesEnabled) return failure('forbidden', 'writes_disabled');
    if (!client?.configured || typeof client[methods[name]] !== 'function')
      return failure('not_configured');
    return null;
  }
  async function execute({ name, arguments: args, principal, signal } = {}) {
    const invalid = validate(name, args, principal);
    if (invalid) return invalid;
    try {
      const result = await client[methods[name]]({ ...args, signal });
      const statuses = new Set([
        'not_configured',
        'forbidden',
        'invalid_request',
        'aborted',
        'timeout',
        'reauthorization_required',
        'permission_denied',
        'not_found',
        'rate_limited',
        'unavailable',
        'invalid_response',
        'response_too_large',
      ]);
      if (result?.status !== 'ready')
        return {
          ...failure(
            statuses.has(result?.status) ? result.status : 'unavailable',
            result?.reason === 'write_outcome_unknown' ? result.reason : undefined,
          ),
          ...(safeDiagnostics(result?.diagnostics)
            ? { diagnostics: safeDiagnostics(result.diagnostics) }
            : {}),
        };
      const isRecord = name === 'read_attio_record' || writes.has(name);
      if (
        (isRecord &&
          (!result.record ||
            result.record.object !== args.object ||
            !validUuid(result.record.recordId) ||
            (args.recordId && result.record.recordId !== args.recordId) ||
            !plainObject(result.record.values))) ||
        (name === 'search_attio_records' &&
          (!Array.isArray(result.records) ||
            result.records.length > (args.limit || 5) ||
            result.records.some(
              (record) => record.object !== args.object || !validUuid(record.recordId),
            ))) ||
        (name === 'list_attio_attributes' && !Array.isArray(result.attributes))
      )
        return failure('invalid_response', writes.has(name) ? 'write_outcome_unknown' : undefined);
      const { context, truncated } = contextOf(result, args.object);
      const records = result.record ? [result.record] : result.records || [];
      const sources = records
        .map((record) => sourceOf(record, sourceId, JSON.stringify(compact(record)), isRecord))
        .filter(Boolean);
      const output = {
        status: name === 'search_attio_records' && !records.length ? 'empty' : 'ready',
        sources,
        attioContext: context,
        coverage: {
          complete: !truncated && name === 'read_attio_record',
          scope:
            name === 'read_attio_record'
              ? 'single_record'
              : name === 'list_attio_attributes'
                ? 'attribute_metadata'
                : writes.has(name)
                  ? 'write_receipt'
                  : 'fuzzy_search',
          partial: truncated || name !== 'read_attio_record',
          possiblyTruncated: truncated || result.coverage?.possiblyTruncated === true,
        },
      };
      if (writes.has(name))
        output.attioWrite = {
          outcome: name === 'create_attio_record' ? 'created' : 'updated',
          object: args.object,
          recordId: result.record.recordId,
          ...(attioRecordUrl(result.record.url) ? { url: attioRecordUrl(result.record.url) } : {}),
        };
      return output;
    } catch {
      return failure(
        writes.has(name) ? 'unavailable' : signal?.aborted ? 'aborted' : 'unavailable',
        writes.has(name) ? 'write_outcome_unknown' : undefined,
      );
    }
  }
  function createRequest({ principal, userMessage } = {}) {
    const actor = {
      id: principal?.id,
      allowedSourceIds: Array.isArray(principal?.allowedSourceIds)
        ? [...principal.allowedSourceIds]
        : [],
    };
    const userAuthorized = typeof userMessage === 'string' && Boolean(userMessage.trim());
    const reads = new Set(),
      receipts = new Map();
    let uncertainWrite = false,
      inputRevision = 0;
    async function requestExecute(input = {}) {
      const { name, arguments: args, signal } = input;
      if (
        input.principal !== undefined &&
        (input.principal?.id !== actor.id || !input.principal?.allowedSourceIds?.includes(sourceId))
      )
        return failure('forbidden');
      const invalid = validate(name, args, actor);
      if (invalid) return invalid;
      const target = `${args.object}:${args.recordId}`;
      if (!writes.has(name)) {
        if (name === 'read_attio_record') reads.delete(target);
        const result = await execute({ name, arguments: args, principal: actor, signal });
        if (
          name === 'read_attio_record' &&
          result.status === 'ready' &&
          result.attioContext?.record?.recordId === args.recordId
        )
          reads.add(target);
        return result;
      }
      if (!userAuthorized) return failure('forbidden', 'current_user_instruction_required');
      const key = `${name}:${name === 'update_attio_record' ? inputRevision : 0}:${canonicalJson(args)}`;
      if (receipts.has(key)) return receipts.get(key);
      if (uncertainWrite) return failure('unavailable', 'write_outcome_unknown');
      if (name === 'update_attio_record' && !reads.has(target)) return failure('read_required');
      if (name === 'update_attio_record') reads.delete(target);
      // Capture arguments before the asynchronous operation. Replays return the
      // same in-flight or settled result, including an unknown write outcome.
      const captured = JSON.parse(canonicalJson(args));
      const pending = execute({ name, arguments: captured, principal: actor, signal }).then(
        (result) => {
          if (result.reason === 'write_outcome_unknown') uncertainWrite = true;
          return result;
        },
      );
      receipts.set(key, pending);
      return pending;
    }
    // Internal transport boundary only: later admitted human input can request
    // a new update of the same record. Existing exact-read permits, all prior
    // receipts, create dedupe and run-wide uncertain-write protection survive.
    return Object.freeze({
      configured: client?.configured === true,
      tools: Object.freeze(tools.filter((tool) => userAuthorized || !writes.has(tool.name))),
      execute: requestExecute,
      advanceUserInput() {
        inputRevision++;
      },
    });
  }
  return Object.freeze({ configured: client?.configured === true, tools, execute, createRequest });
}
