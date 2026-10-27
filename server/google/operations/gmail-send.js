import { createHash } from 'node:crypto';
import { canonicalJson, validateArguments, validUuid } from '../../automation/validation.js';
import { validateMailMessage } from '../gmail-send-contract.js';

import { GMAIL_SEND_TOOLS } from './gmail-send-definitions.js';
const statuses = new Set([
  'not_configured',
  'disabled',
  'forbidden',
  'invalid_request',
  'conflict',
  'schema_not_ready',
  'reauthorization_required',
  'account_mismatch',
  'rate_limited',
  'google_unavailable',
  'aborted',
  'timeout',
  'invalid_response',
  'response_too_large',
  'unavailable',
]);
const actorAllowed = (value) =>
  typeof value?.id === 'string' && value.id.trim() && value.googleAccess === true;
const failure = (status, reason) => ({
  status,
  sent: false,
  sources: [],
  ...(reason ? { reason } : {}),
});
const providerId = (value) => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
const copy = (value) => structuredClone(value);
const requestIdFor = (actor, group, ordinal) => {
  const value = createHash('sha256')
    .update(canonicalJson(['flock-gmail-send-v1', actor, group, ordinal]))
    .digest('hex')
    .slice(0, 32)
    .split('');
  value[12] = '8';
  value[16] = ((parseInt(value[16], 16) & 3) | 8).toString(16);
  const hex = value.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
function project(result, requestId) {
  const receipt = result?.gmailSend;
  if (
    result?.status === 'ready' &&
    result.sent === true &&
    result.accepted === true &&
    receipt?.operation === 'sent' &&
    receipt.requestId === requestId &&
    providerId(receipt.messageId) &&
    (receipt.threadId === undefined || providerId(receipt.threadId))
  ) {
    return {
      status: 'ready',
      sent: true,
      accepted: true,
      sources: [],
      replayed: result.replayed === true,
      gmailSend: {
        operation: 'sent',
        requestId,
        messageId: receipt.messageId,
        ...(receipt.threadId ? { threadId: receipt.threadId } : {}),
      },
    };
  }
  if (
    result?.sent === false &&
    result.blocked === true &&
    result.reason === 'write_outcome_unknown'
  )
    return {
      status: 'unavailable',
      sent: false,
      blocked: true,
      requestId,
      sources: [],
      reason: 'write_outcome_unknown',
    };
  if (result?.sent === 'unknown')
    return {
      status: 'unavailable',
      sent: 'unknown',
      requestId,
      sources: [],
      reason: 'write_outcome_unknown',
    };
  if (result?.sent === false && statuses.has(result.status))
    return {
      ...failure(result.status, result.status === 'conflict' ? 'request_conflict' : undefined),
      requestId,
      ...(result.replayed === true ? { replayed: true } : {}),
    };
  return {
    status: 'unavailable',
    sent: 'unknown',
    requestId,
    sources: [],
    reason: 'write_outcome_unknown',
  };
}

export function createGmailSendOperations({ service } = {}) {
  function createRequest({ principal, requestId, userMessage } = {}) {
    const actor = { id: principal?.id, googleAccess: principal?.googleAccess },
      group = validUuid(requestId) ? requestId.toLowerCase() : null;
    const calls = new Map();
    let nextOrdinal = 0,
      stopped = false,
      currentText = userMessage;
    async function execute({ name, arguments: args, principal: supplied, signal } = {}) {
      if (
        name !== 'send_gmail' ||
        !validateArguments(args, GMAIL_SEND_TOOLS[0].parameters) ||
        !validateMailMessage(args)
      )
        return failure('invalid_request');
      if (
        !actorAllowed(actor) ||
        (supplied !== undefined && (!actorAllowed(supplied) || supplied.id !== actor.id))
      )
        return failure('forbidden');
      if (!group) return failure('invalid_request', 'stable_request_id_required');
      if (typeof currentText !== 'string' || !currentText.trim())
        return failure('forbidden', 'current_user_instruction_required');
      if (!service?.send) return failure('not_configured');
      const identity = canonicalJson(args);
      if (calls.has(identity)) return copy(await calls.get(identity));
      if (stopped)
        return {
          status: 'unavailable',
          sent: false,
          blocked: true,
          sources: [],
          reason: 'write_outcome_unknown',
        };
      if (nextOrdinal > 31) return failure('invalid_request');
      const ordinal = nextOrdinal++,
        operationId = requestIdFor(actor.id, group, ordinal),
        captured = copy(args);
      const pending = Promise.resolve()
        .then(() =>
          service.send({
            requestId: operationId,
            ...captured,
            groupId: group,
            ordinal,
            principal: actor,
            signal,
          }),
        )
        .then(
          (result) => project(result, operationId),
          () => project(null, operationId),
        )
        .then((result) => {
          if (result.sent === 'unknown' || result.blocked === true || result.status === 'conflict')
            stopped = true;
          return result;
        });
      calls.set(identity, pending);
      return copy(await pending);
    }
    return Object.freeze({
      configured: service?.configured === true,
      tools: GMAIL_SEND_TOOLS,
      execute,
      advanceUserInput({ userMessage: nextText } = {}) {
        if (typeof nextText === 'string') currentText = nextText;
      },
    });
  }
  return Object.freeze({
    configured: service?.configured === true,
    tools: GMAIL_SEND_TOOLS,
    createRequest,
    execute: () => Promise.resolve(failure('forbidden', 'current_user_instruction_required')),
  });
}
