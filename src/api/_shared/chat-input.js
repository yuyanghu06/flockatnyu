import {
  contactContextOfMessage,
  contactTextMessages,
} from '../../../server/chat-contact-context.js';
import {
  AttachmentError,
  attachmentBudget,
  normalizeAttachments,
  ATTACHMENT_ONLY_CONTENT,
  MAX_CHAT_BODY_BYTES,
} from '../../../server/chat-attachments.js';
import { canonicalTimeZone } from '../../../server/time-zone.js';
import { validUuid } from '../../../server/automation/validation.js';
import { readJSON } from './http.js';

export async function readConversation(request, timeoutMs) {
  const value = await readJSON(request, timeoutMs, MAX_CHAT_BODY_BYTES);
  if (
    !value ||
    !Array.isArray(value.messages) ||
    !value.messages.length ||
    value.messages.length > 20
  )
    throw new Error('invalid');
  let total = 0;
  const budget = attachmentBudget();
  const messages = value.messages.map((message) => {
    if (
      !message ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      message.content.length > 8000
    )
      throw new Error('invalid');
    if (message.attachments !== undefined && message.role !== 'user') throw new AttachmentError();
    const contactContext = contactContextOfMessage(message);
    const attachments = normalizeAttachments(message.attachments, budget);
    if (!message.content.trim() && !attachments.length) throw new Error('invalid');
    const content = message.content.trim() ? message.content : ATTACHMENT_ONLY_CONTENT;
    total += content.length;
    return {
      role: message.role,
      content,
      ...(attachments.length ? { attachments } : {}),
      ...(contactContext === undefined ? {} : { contactContext }),
    };
  });
  const textBytes = new TextEncoder().encode(
    JSON.stringify({ messages: contactTextMessages(messages) }),
  ).length;
  if (total > 16000 || textBytes > 32500 || messages.at(-1).role !== 'user')
    throw new Error('invalid');
  if (
    value.buildingId !== undefined &&
    (typeof value.buildingId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.buildingId))
  )
    throw new Error('invalid');
  const timeZone = canonicalTimeZone(value.timeZone);
  if (!timeZone) throw new Error('invalid');
  if (value.steering !== undefined && typeof value.steering !== 'boolean')
    throw new Error('invalid');
  if (value.requestId !== undefined && !validUuid(value.requestId)) throw new Error('invalid');
  return {
    messages,
    buildingId: value.buildingId,
    timeZone,
    ...(value.requestId === undefined ? {} : { requestId: value.requestId.toLowerCase() }),
    ...(value.steering === true ? { steering: true } : {}),
  };
}
