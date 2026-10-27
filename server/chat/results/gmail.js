import { uuid } from '../../map/events.js';

export function projectGmailResult({ data, result }) {
  // Outgoing content remains in the proposed tool call only. Operational
  // results expose a bounded confirmed receipt, never message contents.
  data.sources = [];
  data.arguments = {};
  const receipt = result?.gmailSend,
    providerId = (value) => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
  if (
    result?.status === 'ready' &&
    result.sent === true &&
    result.accepted === true &&
    receipt?.operation === 'sent' &&
    uuid(receipt.requestId) &&
    providerId(receipt.messageId) &&
    (receipt.threadId === undefined || providerId(receipt.threadId))
  ) {
    data.sent = true;
    data.accepted = true;
    data.replayed = result.replayed === true;
    data.gmailSend = {
      operation: 'sent',
      requestId: receipt.requestId,
      messageId: receipt.messageId,
      ...(receipt.threadId ? { threadId: receipt.threadId } : {}),
    };
  } else if (result?.sent === false && result.status !== 'ready') {
    data.sent = false;
    if (uuid(result.requestId)) data.requestId = result.requestId;
    if (result.reason === 'stable_request_id_required') data.reason = result.reason;
    if (result.blocked === true) {
      data.blocked = true;
      data.reason = 'write_outcome_unknown';
    }
    if (result.status === 'conflict') data.reason = 'request_conflict';
  } else {
    data.status = 'unavailable';
    data.sent = 'unknown';
    data.reason = 'write_outcome_unknown';
    if (uuid(result?.requestId)) data.requestId = result.requestId;
  }
  return data;
}
