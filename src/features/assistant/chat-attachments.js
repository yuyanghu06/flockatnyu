import {
  AttachmentError,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_TEXT_BYTES,
  MAX_TEXT_FILE_BYTES,
  attachmentMime,
  normalizeAttachments,
} from '../../../server/chat/attachment-contract.js';
export {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ONLY_CONTENT,
  AttachmentError,
  attachmentBudget,
  normalizeAttachments,
  MAX_CHAT_BODY_BYTES,
} from '../../../server/chat/attachment-contract.js';
export async function readAttachmentFiles(files, existing = []) {
  const selected = Array.from(files || []);
  if (selected.length + existing.length > MAX_FILES) throw new AttachmentError('attachment_total');
  // Check metadata before loading any selected payload into memory.
  let totalBytes = existing.reduce(
    (sum, file) =>
      sum +
      (file.data.length / 4) * 3 -
      (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0),
    0,
  );
  let textBytes = existing
    .filter((file) => file.mimeType === 'text/plain')
    .reduce(
      (sum, file) =>
        sum +
        (file.data.length / 4) * 3 -
        (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0),
      0,
    );
  for (const file of selected) {
    const mimeType = attachmentMime(file.name, file.type);
    if (
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > MAX_FILE_BYTES ||
      (mimeType === 'text/plain' && file.size > MAX_TEXT_FILE_BYTES)
    )
      throw new AttachmentError('attachment_size');
    totalBytes += file.size;
    if (mimeType === 'text/plain') textBytes += file.size;
  }
  if (totalBytes > MAX_ATTACHMENT_BYTES || textBytes > MAX_TEXT_BYTES)
    throw new AttachmentError('attachment_total');
  const result = [...existing];
  for (const file of selected) {
    const mimeType = attachmentMime(file.name, file.type);
    if (
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > MAX_FILE_BYTES ||
      (mimeType === 'text/plain' && file.size > MAX_TEXT_FILE_BYTES)
    )
      throw new AttachmentError('attachment_size');
    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      throw new AttachmentError();
    }
    if (bytes.length !== file.size) throw new AttachmentError();
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 32768)
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
    result.push({ name: file.name, mimeType, data: btoa(chunks.join('')) });
  }
  return normalizeAttachments(result);
}
