import { plainObject, validUuid } from '../automation/validation.js';

export const GMAIL_SEND_LIMITS = Object.freeze({ recipients: 10, address: 320, subject: 200, body: 20000, bodyBytes: 65536 });
const exact = (value, keys) => plainObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const unicodeText = value => typeof value === 'string' && value.isWellFormed() && !value.includes('\0');

// Literal ASCII mailboxes only: no names, comments, quoted local parts or lists.
export function validGmailSendAddress(value) {
  if (typeof value !== 'string' || value.length > GMAIL_SEND_LIMITS.address || !/^[\x21-\x7e]+$/.test(value)) return false;
  const parts = value.split('@');
  return parts.length === 2 && parts[0].length >= 1 && parts[0].length <= 64
    && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) && !parts[0].startsWith('.') && !parts[0].endsWith('.') && !parts[0].includes('..')
    && parts[1].length <= 253 && parts[1].includes('.')
    && parts[1].split('.').every(part => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(part));
}

export function validateMailMessage(value) {
  return exact(value, ['to', 'subject', 'body']) && Array.isArray(value.to) && value.to.length >= 1
    && value.to.length <= GMAIL_SEND_LIMITS.recipients && value.to.every(validGmailSendAddress)
    && unicodeText(value.subject) && value.subject.length <= GMAIL_SEND_LIMITS.subject
    && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value.subject)
    && unicodeText(value.body) && value.body.length <= GMAIL_SEND_LIMITS.body
    && Buffer.byteLength(value.body, 'utf8') <= GMAIL_SEND_LIMITS.bodyBytes;
}

export function validateGmailSendInput(value) {
  return exact(value, ['requestId', 'to', 'subject', 'body']) && validUuid(value.requestId)
    && validateMailMessage({ to: value.to, subject: value.subject, body: value.body });
}

export function normalizeGmailSendInput(value) {
  if (!validateGmailSendInput(value)) throw new TypeError('Invalid Gmail send input');
  return { requestId: value.requestId.toLowerCase(), to: [...value.to], subject: value.subject, body: value.body };
}
