import { promptText } from '../../prompt-loader/index.js';
import { GMAIL_SEND_LIMITS } from '../gmail-send-contract.js';
export const GMAIL_SEND_TOOLS = Object.freeze([
  Object.freeze({
    name: 'send_gmail',
    readOnly: false,
    description: promptText('tools/gmail/send_gmail#description'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['to', 'subject', 'body'],
      properties: {
        to: {
          type: 'array',
          minItems: 1,
          maxItems: GMAIL_SEND_LIMITS.recipients,
          items: { type: 'string', minLength: 3, maxLength: GMAIL_SEND_LIMITS.address },
        },
        subject: { type: 'string', maxLength: GMAIL_SEND_LIMITS.subject },
        body: { type: 'string', maxLength: GMAIL_SEND_LIMITS.body },
      },
    },
  }),
]);
