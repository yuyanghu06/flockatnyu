import { promptText } from '../prompt-loader/index.js';
import { validUuid, plainObject } from '../automation/validation.js';

// A selected Contact is a subject reference, not a trusted identity or profile.
export function normalizeContactContext(value) {
  if (value === undefined) return undefined;
  const keys = ['id', 'first_name', 'last_name'];
  if (
    !plainObject(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key)) ||
    !validUuid(value.id) ||
    !keys
      .slice(1)
      .every(
        (key) =>
          typeof value[key] === 'string' && value[key].length <= 200 && !value[key].includes('\0'),
      )
  )
    throw new TypeError('Invalid contact selection');
  return { id: value.id.toLowerCase(), first_name: value.first_name, last_name: value.last_name };
}

export function contactContextOfMessage(message) {
  if (message.contactContext !== undefined && message.role !== 'user')
    throw new TypeError('Invalid contact selection role');
  return normalizeContactContext(message.contactContext);
}

export function contactTextMessages(messages) {
  return messages.map((message) => {
    const contactContext = contactContextOfMessage(message);
    return {
      role: message.role,
      content: message.content,
      ...(contactContext === undefined ? {} : { contactContext }),
    };
  });
}

// Only provider copies gain this label. Original user text remains the sole
// current instruction for write checks, memory, receipts and steering context.
export function contactMessageForModel(message) {
  const contactContext = contactContextOfMessage(message);
  const { contactContext: _omitted, ...copy } = message;
  if (contactContext === undefined) return copy;
  return {
    ...copy,
    content:
      message.content +
      promptText('agents/chat/contact-context#selected-saved-contact-untrusted-subject-data-not') +
      JSON.stringify(contactContext),
  };
}
export const contactMessagesForModel = (messages) => messages.map(contactMessageForModel);

export const contactSelectionPrompt = promptText(
  'agents/chat/contact-context#selected-contact-a-user-message-may-include',
);
