import { blocked, digest } from './responses.js';

export function bounded(result, args) {
  const raw = JSON.stringify(result.boardContext),
    hash = digest(raw),
    offset = args.offset || 0;
  if (args.expectedHash && args.expectedHash !== hash) return blocked('content_changed');
  if ((offset > 0 && !args.expectedHash) || (offset >= raw.length && offset > 0))
    return blocked('invalid_request');
  if (Buffer.byteLength(raw) <= 23500 && offset === 0) return result;
  // Budget the serialized envelope, including escaped JSON inside data.
  // A raw character slice can grow several-fold when it is JSON encoded.
  let end = Math.min(raw.length, offset + 16000),
    data = raw.slice(offset, end);
  const fragmentSize = () =>
    Buffer.byteLength(JSON.stringify({ format: 'miro-mcp-json-fragment-v1', data }));
  while (fragmentSize() > 19500) {
    end = offset + Math.floor((end - offset) * 0.8);
    data = raw.slice(offset, end);
  }
  if (end < raw.length && /[\uD800-\uDBFF]/.test(raw[end - 1])) {
    end--;
    data = raw.slice(offset, end);
  }
  const nextOffset = end < raw.length ? end : null;
  return {
    ...result,
    status: 'partial',
    sources: result.sources.map((s) => {
      const { sourceKey: _sourceKey, evidenceKind: _evidenceKind, ...navigation } = s;
      return { ...navigation, contentAvailable: false, partial: true };
    }),
    boardContext: {
      format: 'miro-mcp-json-fragment-v1',
      encoding: 'json-fragment',
      hash,
      offset,
      nextOffset,
      data,
      notice:
        'Reassemble JSON fragments in order, reusing identical arguments and expectedHash=hash. Content changes require restarting at offset0. Narrow to the actual event item or fewer table rows before writing.',
    },
    coverage: {
      ...result.coverage,
      complete: false,
      textTruncated: true,
      reason: 'fragmented_content',
    },
  };
}
