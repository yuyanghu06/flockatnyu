import { createHash, createHmac } from 'node:crypto';
import { canonicalJson, plainObject, validUuid } from '../automation/validation.js';
import { normalizeGmailSendInput, validGmailSendAddress } from './gmail-send-contract.js';

const reasons = new Set([
  'not_configured',
  'disabled',
  'reauthorization_required',
  'account_mismatch',
  'forbidden',
  'invalid_request',
  'rate_limited',
  'google_unavailable',
  'aborted',
  'timeout',
  'invalid_response',
  'response_too_large',
  'unavailable',
]);
const safeReason = (status) =>
  status === 'permission_denied'
    ? 'forbidden'
    : reasons.has(status)
      ? status
      : 'google_unavailable';
const messageId = (value) => typeof value === 'string' && /^[a-fA-F0-9]{1,64}$/.test(value);
const stamp = (value) =>
  typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
const hash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const authorized = (principal) =>
  typeof principal?.id === 'string' &&
  principal.id.trim().length > 0 &&
  principal.id.length <= 512 &&
  principal.googleAccess === true;
const unknown = (requestId) => ({
  status: 'unavailable',
  sent: 'unknown',
  reason: 'write_outcome_unknown',
  ...(requestId ? { requestId } : {}),
});
const fail = (status, requestId, reason) => ({
  status,
  sent: false,
  ...(requestId ? { requestId } : {}),
  ...(reason ? { reason } : {}),
});

function validReceipt(value) {
  if (
    !plainObject(value) ||
    !hash(value.actorHash) ||
    !hash(value.senderHash) ||
    !hash(value.payloadHash) ||
    !validUuid(value.requestId) ||
    !validUuid(value.groupId) ||
    !Number.isInteger(value.ordinal) ||
    value.ordinal < 0 ||
    value.ordinal > 31 ||
    !stamp(value.createdAt) ||
    !stamp(value.updatedAt)
  )
    return false;
  if (value.status === 'sent')
    return (
      messageId(value.messageId) &&
      (value.threadId === null || messageId(value.threadId)) &&
      value.reason === null
    );
  if (value.messageId !== null || value.threadId !== null) return false;
  if (value.status === 'dispatching') return value.reason === null;
  if (value.status === 'unknown') return value.reason === 'write_outcome_unknown';
  return value.status === 'failed' && reasons.has(value.reason);
}
function projectReceipt(receipt, replayed) {
  if (receipt.status === 'sent')
    return {
      status: 'ready',
      sent: true,
      accepted: true,
      replayed,
      gmailSend: {
        operation: 'sent',
        requestId: receipt.requestId,
        messageId: receipt.messageId,
        ...(receipt.threadId === null ? {} : { threadId: receipt.threadId }),
      },
    };
  if (receipt.status === 'failed') return { ...fail(receipt.reason, receipt.requestId), replayed };
  return unknown(receipt.requestId);
}

// Operational metadata is durable before the one named Google send operation.
// No sender-cache, Contacts, source message, mailbox search or model is read here.
export function createGmailSendService({
  client,
  store,
  env = process.env,
  receiptKey = env.GMAIL_SEND_RECEIPT_KEY,
  senderEmail = env.GOOGLE_EXPECTED_ACCOUNT_EMAIL,
} = {}) {
  const keyReady =
    typeof receiptKey === 'string' &&
    receiptKey.length >= 32 &&
    receiptKey.length <= 4096 &&
    !receiptKey.includes('\0');
  const sender = typeof senderEmail === 'string' ? senderEmail.trim().toLowerCase() : '';
  const metadataReady = Boolean(
    keyReady &&
    validGmailSendAddress(sender) &&
    store?.configured === true &&
    ['probe', 'claim', 'finish', 'read'].every((name) => typeof store[name] === 'function'),
  );
  const configured =
    metadataReady && client?.configured === true && typeof client.send === 'function';
  const digest = (kind, value) =>
    createHmac('sha256', receiptKey)
      .update(kind + ':' + canonicalJson(value))
      .digest('hex');
  // Actor identity must survive receipt-key rotation: a changed payload/sender
  // HMAC then conflicts with the existing operation instead of sending again.
  const actorOf = (principal) =>
    createHash('sha256')
      .update('flock-gmail-send-actor-v1:' + principal.id)
      .digest('hex');
  async function call(name, args) {
    try {
      return await store[name](args);
    } catch {
      return { status: 'unavailable', reason: 'write_outcome_unknown' };
    }
  }
  async function readiness({ principal, signal } = {}) {
    if (!authorized(principal)) return fail('forbidden');
    if (!metadataReady)
      return { status: 'not_configured', configured: false, receiptStoreReady: false, sent: false };
    const probe = await call('probe', { signal });
    if (probe?.status !== 'ready' || probe.contract !== 'gmail-send-receipts-v1')
      return { status: 'schema_not_ready', configured, receiptStoreReady: false, sent: false };
    if (typeof client?.readiness !== 'function')
      return { status: 'not_configured', configured: false, receiptStoreReady: true, sent: false };
    let result;
    try {
      result = await client.readiness({ signal });
    } catch {
      result = { status: 'unavailable' };
    }
    if (
      result?.status !== 'ready' ||
      result.accountVerified !== true ||
      result.scopeVerified !== true ||
      result.canSend !== true
    ) {
      return {
        status: safeReason(result?.status),
        configured,
        enabled: client?.enabled === true,
        receiptStoreReady: true,
        accountVerified: result?.accountVerified === true,
        sendScopeGranted: result?.scopeVerified === true,
        sent: false,
      };
    }
    return {
      status: 'ready',
      configured,
      enabled: true,
      receiptStoreReady: true,
      accountVerified: true,
      sendScopeGranted: true,
      sent: false,
    };
  }
  async function getStatus({ requestId, principal, signal } = {}) {
    if (!authorized(principal)) return fail('forbidden');
    if (!validUuid(requestId)) return fail('invalid_request');
    if (!metadataReady) return fail('not_configured', requestId.toLowerCase());
    const actorHash = actorOf(principal),
      id = requestId.toLowerCase();
    const found = await call('read', { actorHash, requestId: id, signal });
    if (found?.status === 'not_found') return { status: 'not_found', requestId: id };
    if (
      found?.status !== 'ready' ||
      !validReceipt(found.receipt) ||
      found.receipt.actorHash !== actorHash ||
      found.receipt.requestId !== id
    ) {
      return found?.status === 'forbidden' ? fail('forbidden', id) : unknown(id);
    }
    return projectReceipt(found.receipt, true);
  }
  async function send({
    requestId,
    to,
    subject,
    body,
    principal,
    groupId = requestId,
    ordinal = 0,
    signal,
  } = {}) {
    if (!authorized(principal)) return fail('forbidden');
    let input;
    try {
      input = normalizeGmailSendInput({ requestId, to, subject, body });
    } catch {
      return fail('invalid_request');
    }
    if (!validUuid(groupId) || !Number.isInteger(ordinal) || ordinal < 0 || ordinal > 31)
      return fail('invalid_request', input.requestId);
    if (!metadataReady) return fail('not_configured', input.requestId);
    if (signal?.aborted) return fail('aborted', input.requestId);
    const binding = {
      actorHash: actorOf(principal),
      senderHash: digest('sender', sender),
      payloadHash: digest('payload', { to: input.to, subject: input.subject, body: input.body }),
      requestId: input.requestId,
      groupId: groupId.toLowerCase(),
      ordinal,
    };
    const matches = (receipt) =>
      validReceipt(receipt) &&
      Object.entries(binding).every(([name, value]) => receipt[name] === value);
    const claimed = await call('claim', { ...binding, signal });
    if (claimed?.status === 'conflict')
      return fail('conflict', input.requestId, 'request_conflict');
    if (claimed?.status === 'blocked')
      return {
        status: 'unavailable',
        sent: false,
        blocked: true,
        reason: 'write_outcome_unknown',
        requestId: input.requestId,
      };
    if (claimed?.status === 'ready')
      return matches(claimed.receipt)
        ? projectReceipt(claimed.receipt, true)
        : unknown(input.requestId);
    if (
      claimed?.status !== 'claimed' ||
      !validUuid(claimed.token) ||
      !matches(claimed.receipt) ||
      claimed.receipt.status !== 'dispatching'
    ) {
      // An unconfirmed claim is never permission to send, including on restart.
      if (
        ['not_configured', 'schema_not_ready', 'forbidden', 'invalid_request', 'aborted'].includes(
          claimed?.status,
        )
      )
        return fail(claimed.status, input.requestId);
      return unknown(input.requestId);
    }
    let result;
    try {
      result =
        typeof client?.send === 'function'
          ? await client.send({ ...input, signal })
          : { status: 'not_configured', sent: false };
    } catch {
      result = { status: 'unavailable', sent: 'unknown' };
    }
    let completion;
    if (
      result?.status === 'ready' &&
      result.sent === true &&
      result.accepted === true &&
      messageId(result.messageId) &&
      (result.threadId === undefined || messageId(result.threadId))
    ) {
      completion = {
        status: 'sent',
        messageId: result.messageId,
        ...(result.threadId === undefined ? {} : { threadId: result.threadId }),
      };
    } else if (
      plainObject(result) &&
      result.sent === false &&
      (reasons.has(result.status) || result.status === 'permission_denied')
    )
      completion = { status: 'failed', reason: safeReason(result.status) };
    else completion = { status: 'unknown', reason: 'write_outcome_unknown' };
    // Receipt finalization is bounded metadata cleanup even if the caller has
    // cancelled. It never repeats the provider operation.
    const finished = await call('finish', {
      actorHash: binding.actorHash,
      requestId: input.requestId,
      token: claimed.token,
      ...completion,
    });
    if (
      finished?.status === 'ready' &&
      matches(finished.receipt) &&
      finished.receipt.status === completion.status &&
      (completion.status !== 'sent' ||
        (finished.receipt.messageId === completion.messageId &&
          finished.receipt.threadId === (completion.threadId ?? null))) &&
      (completion.status === 'sent' || finished.receipt.reason === completion.reason)
    )
      return projectReceipt(finished.receipt, false);
    // Read-only recovery can confirm a committed receipt whose HTTP reply was lost.
    const recovered = await call('read', {
      actorHash: binding.actorHash,
      requestId: input.requestId,
    });
    if (
      recovered?.status === 'ready' &&
      matches(recovered.receipt) &&
      recovered.receipt.status === completion.status &&
      (completion.status !== 'sent' ||
        (recovered.receipt.messageId === completion.messageId &&
          recovered.receipt.threadId === (completion.threadId ?? null))) &&
      (completion.status === 'sent' || recovered.receipt.reason === completion.reason)
    )
      return projectReceipt(recovered.receipt, false);
    return unknown(input.requestId);
  }
  return Object.freeze({ configured, readiness, status: readiness, send, getStatus });
}
