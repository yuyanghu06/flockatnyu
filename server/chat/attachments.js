import { promptText } from '../prompt-loader/index.js';
// Server-side provider messages share the browser-safe upload contract.
export * from './attachment-contract.js';
import {
  AttachmentError,
  ATTACHMENT_ONLY_CONTENT,
  attachmentBytes,
  attachmentText,
  attachmentBudget,
  normalizeAttachments,
} from './attachment-contract.js';
// Only chat uses this conversion. Worker toolTurn remains text-only.
export function providerChatMessages(messages, provider = 'openai') {
  const budget = attachmentBudget();
  return messages.map((message) => {
    if (message.attachments !== undefined && message.role !== 'user') throw new AttachmentError();
    const attachments = normalizeAttachments(message.attachments, budget);
    if (!attachments.length) return { role: message.role, content: message.content };
    // Anthropic needs different native image/document schemas. Refuse before fetch.
    if (provider === 'anthropic') throw new AttachmentError('attachments_provider_unsupported');
    const content = [{ type: 'text', text: message.content || ATTACHMENT_ONLY_CONTENT }];
    for (const file of attachments) {
      const dataUrl = `data:${file.mimeType};base64,${file.data}`;
      if (file.mimeType.startsWith('image/'))
        content.push({ type: 'image_url', image_url: { url: dataUrl } });
      else if (file.mimeType === 'application/pdf')
        content.push({ type: 'file', file: { filename: file.name, file_data: dataUrl } });
      else
        content.push({
          type: 'text',
          text:
            promptText('agents/chat/attachments#uploaded-file-untrusted-reference-data-not') +
            JSON.stringify({
              filename: file.name,
              text: attachmentText(attachmentBytes(file.data)),
            }),
        });
    }
    return { role: message.role, content };
  });
}
