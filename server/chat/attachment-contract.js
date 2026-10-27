// Browser-safe upload contract. This module has no I/O, secrets, or Node imports.
export const MAX_FILES = 4;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 128 * 1024;
export const MAX_TEXT_BYTES = 256 * 1024;
export const MAX_CHAT_BODY_BYTES = 14 * 1024 * 1024;
export const ATTACHMENT_ONLY_CONTENT = 'Please review the attached files.';
export const attachmentErrors = {
  attachment_invalid: 'The attachment is invalid. Choose the file again.',
  attachment_type:
    'Supported files: PNG, JPEG, WebP, PDF, and UTF-8 text or code (.txt, .md, .csv, .json, .js, .ts, .py, .css, .sql, .yaml and similar).',
  attachment_size: 'Each file must be 5 MiB or smaller; text files must be 128 KiB or smaller.',
  attachment_total:
    'Use up to 4 files and 10 MiB total per conversation request (256 KiB total text). Remove a file or start a new conversation.',
  attachment_encoding: 'Text files must contain valid UTF-8 text without binary data.',
  attachment_signature: 'The file contents do not match the selected file type.',
  attachments_provider_unsupported:
    'File attachments are unavailable with this assistant provider.',
};
export class AttachmentError extends Error {
  constructor(code = 'attachment_invalid') {
    super(attachmentErrors[code] || attachmentErrors.attachment_invalid);
    this.code = code;
  }
}
const textExtensions = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'js',
  'mjs',
  'cjs',
  'ts',
  'jsx',
  'tsx',
  'py',
  'rb',
  'rs',
  'go',
  'java',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'css',
  'sql',
  'yaml',
  'yml',
  'sh',
  'toml',
  'log',
]);
export const ATTACHMENT_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.pdf,' + [...textExtensions].map((ext) => `.${ext}`).join(',');
const binaryExtensions = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
const textMimes = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'text/typescript',
  'text/jsx',
  'text/tsx',
  'video/mp2t',
  'text/x-python',
  'application/x-python-code',
  'text/css',
  'application/sql',
  'text/x-sql',
  'text/yaml',
  'application/yaml',
  'application/x-yaml',
  'text/x-shellscript',
  'application/toml',
]);
export function attachmentMime(name, declared = '') {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 180 ||
    // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
    /[\x00-\x1f\x7f/\\]/.test(name) ||
    typeof declared !== 'string'
  )
    throw new AttachmentError();
  const extension = name.split('.').at(-1).toLowerCase();
  const mime = declared.toLowerCase().trim();
  if (binaryExtensions[extension]) {
    if (mime && mime !== 'application/octet-stream' && mime !== binaryExtensions[extension])
      throw new AttachmentError('attachment_type');
    return binaryExtensions[extension];
  }
  if (
    textExtensions.has(extension) &&
    (!mime ||
      mime === 'application/octet-stream' ||
      textMimes.has(mime) ||
      /^text\/x-[a-z0-9+-]+$/.test(mime))
  )
    return 'text/plain';
  throw new AttachmentError('attachment_type');
}
export function attachmentBytes(data) {
  if (typeof data !== 'string' || !data.length || data.length % 4)
    throw new AttachmentError('attachment_invalid');
  if (data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw new AttachmentError('attachment_size');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new AttachmentError();
  let raw;
  try {
    raw = atob(data);
  } catch {
    throw new AttachmentError();
  }
  if (btoa(raw) !== data) throw new AttachmentError();
  if (!raw.length || raw.length > MAX_FILE_BYTES) throw new AttachmentError('attachment_size');
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
export function attachmentText(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new AttachmentError('attachment_encoding');
  }
  // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text)) throw new AttachmentError('attachment_encoding');
  return text;
}
export function attachmentBudget() {
  return { count: 0, bytes: 0, textBytes: 0 };
}
export function normalizeAttachments(value, budget = attachmentBudget()) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AttachmentError();
  if (value.length > MAX_FILES) throw new AttachmentError('attachment_total');
  return value.map((file) => {
    if (
      !file ||
      typeof file !== 'object' ||
      Array.isArray(file) ||
      Object.keys(file).some((key) => !['name', 'mimeType', 'data'].includes(key))
    )
      throw new AttachmentError();
    const mimeType = attachmentMime(file.name, file.mimeType);
    const bytes = attachmentBytes(file.data);
    if (mimeType === 'text/plain') {
      if (bytes.length > MAX_TEXT_FILE_BYTES) throw new AttachmentError('attachment_size');
      attachmentText(bytes);
      budget.textBytes += bytes.length;
    } else {
      const starts = (...prefix) => prefix.every((byte, i) => bytes[i] === byte);
      const valid =
        mimeType === 'image/png'
          ? starts(137, 80, 78, 71, 13, 10, 26, 10)
          : mimeType === 'image/jpeg'
            ? starts(255, 216, 255)
            : mimeType === 'image/webp'
              ? starts(82, 73, 70, 70) && [87, 69, 66, 80].every((byte, i) => bytes[i + 8] === byte)
              : starts(37, 80, 68, 70, 45);
      if (!valid) throw new AttachmentError('attachment_signature');
    }
    budget.count++;
    budget.bytes += bytes.length;
    if (
      budget.count > MAX_FILES ||
      budget.bytes > MAX_ATTACHMENT_BYTES ||
      budget.textBytes > MAX_TEXT_BYTES
    )
      throw new AttachmentError('attachment_total');
    return { name: file.name, mimeType, data: file.data };
  });
}
