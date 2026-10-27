export const SECRET_KEY =
  /(?:password|passwd|secret|credential|authorization|cookie|api.?key|access.?token|refresh.?token|private.?key|service.?role|client.?secret|token|^key$)/i;
const MAX_OUTPUT = 512 * 1024;
export function secretsFrom(env) {
  const values = new Set();
  const collect = (v) => {
    if (typeof v === 'string' && v.length > 0) {
      values.add(v);
      if (v.trim()) values.add(v.trim());
    }
  };
  for (const [key, value] of Object.entries(env))
    if (
      (SECRET_KEY.test(key) ||
        (key === 'LLM_PROVIDERS_JSON' && typeof value === 'string' && value.trim())) &&
      typeof value === 'string'
    ) {
      collect(value);
      try {
        const walk = (v, depth = 0) => {
          if (depth > 8) return;
          if (v && typeof v === 'object')
            for (const [k, x] of Object.entries(v)) {
              if (SECRET_KEY.test(k)) collect(x);
              walk(x, depth + 1);
            }
        };
        walk(JSON.parse(value));
      } catch {
        /* Non-JSON secret. */
      }
    }
  return [...values].sort((a, b) => b.length - a.length);
}
export function serializer(secretValues) {
  return (output) => {
    let truncated = false,
      redacted = false,
      budget = MAX_OUTPUT - 4096,
      originalBytes = 0;
    const seen = new WeakSet();
    const cleanText = (text, depth, parseEmbedded = true) => {
      originalBytes += Buffer.byteLength(text);
      // Redact BEFORE truncation so a cut cannot reveal a credential prefix.
      for (const value of secretValues)
        if (text.includes(value)) {
          text = text.split(value).join('[REDACTED]');
          redacted = true;
        }
      // Tool arguments may contain JSON strings inside JSON strings. Apply the same
      // key policy after decoding, with the existing depth/size budget at every layer.
      if (parseEmbedded && /^\s*[[{"]/.test(text)) {
        if (depth >= 16 || Buffer.byteLength(text) > MAX_OUTPUT) {
          truncated = true;
          return '[TRUNCATED: encoded JSON limit]';
        }
        try {
          const decoded = JSON.parse(text);
          if (decoded !== null && (typeof decoded === 'object' || typeof decoded === 'string'))
            text = JSON.stringify(walk(decoded, depth + 1));
        } catch {
          /* Malformed fragments receive credential-pattern scrubbing below. */
        }
      }
      text = text
        .replace(/\bBearer\s+[^\s"'<>]+/gi, () => {
          redacted = true;
          return 'Bearer [REDACTED]';
        })
        .replace(
          /\b(?:sk-[a-zA-Z0-9_-]{10,}|eyJ[a-zA-Z0-9_-]{12,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,
          () => {
            redacted = true;
            return '[REDACTED]';
          },
        )
        .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, (_, prefix) => {
          redacted = true;
          return `${prefix}[REDACTED]@`;
        })
        .replace(
          /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?role|client[_-]?secret|password|passwd|secret|credential|authorization|cookie|token|key)[\\"']*\s*[=:]\s*)([\\]*["'])([\s\S]*?)\2/gi,
          (_, prefix, quote) => {
            redacted = true;
            return `${prefix}${quote}[REDACTED]${quote}`;
          },
        )
        .replace(
          /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|service[_-]?role|client[_-]?secret|password|passwd|secret|credential|authorization|cookie|token|key)[\\"']*\s*[=:]\s*[\\"']*)[^\s\\"'&,;}]+/gi,
          (_, prefix) => {
            redacted = true;
            return `${prefix}[REDACTED]`;
          },
        );
      const bytes = Buffer.byteLength(text);
      if (bytes > budget) {
        truncated = true;
        const result = Buffer.from(text).subarray(0, Math.max(0, budget)).toString('utf8');
        budget = 0;
        return result;
      }
      budget -= bytes;
      return text;
    };
    const walk = (value, depth) => {
      if (depth > 16 || budget <= 0) {
        truncated = true;
        return '[TRUNCATED]';
      }
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'string') return cleanText(value, depth);
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value !== 'object') return null;
      if (seen.has(value)) {
        truncated = true;
        return '[CIRCULAR]';
      }
      seen.add(value);
      if (Array.isArray(value)) {
        const result = [];
        for (const x of value.slice(0, 1000)) {
          if (budget <= 0) {
            truncated = true;
            break;
          }
          budget -= 8;
          result.push(walk(x, depth + 1));
        }
        if (value.length > result.length) truncated = true;
        return result;
      }
      const result = Object.create(null);
      let n = 0;
      for (const [key, x] of Object.entries(value)) {
        if (n++ >= 1000 || budget <= 0) {
          truncated = true;
          break;
        }
        const k = cleanText(key, depth, false).slice(0, 256);
        budget -= 16;
        if (SECRET_KEY.test(key)) {
          result[k] = '[REDACTED]';
          redacted = true;
        } else result[k] = walk(x, depth + 1);
      }
      return result;
    };
    const value = walk(output ?? null, 0);
    let storedBytes = Buffer.byteLength(JSON.stringify(value));
    // Key/JSON syntax overhead is separately bounded, including deeply nested structures.
    if (storedBytes > MAX_OUTPUT) {
      truncated = true;
      return {
        value: '[TRUNCATED: serialization limit]',
        truncated,
        redacted,
        originalBytes,
        originalBytesScope: 'visited_text_only',
        storedBytes: 38,
      };
    }
    return {
      value,
      truncated,
      redacted,
      originalBytes,
      originalBytesScope: 'visited_text_only',
      storedBytes,
    };
  };
}
