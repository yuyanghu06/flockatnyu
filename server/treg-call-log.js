import { constants } from 'node:fs';
import { mkdir, lstat, open, opendir, unlink } from 'node:fs/promises';
import { resolve, join, dirname, parse } from 'node:path';
import { randomUUID } from 'node:crypto';

const retentionMs = 7 * 24 * 60 * 60 * 1000;
const ownFile = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jsonl$/;
const maximumScan = 1000, maximumEventBytes = 4_000_000;
const secretKey = key => /(?:^|_)(?:authorization|proxy_authorization|cookie|set_cookie|password|passwd|secret|token|api_key|apikey|access_key|private_key|service_role_key|credential|credentials)(?:_|$)/i
  .test(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_'));
const fail = () => ({ status: 'log_unavailable' });

// This logger is private service storage, never a public/model-facing reader.
// Each append is flushed to disk before callers may continue to paid work.
export function createTregCallLogger({ env = process.env, directory, now = () => new Date(), secretValues = [] } = {}) {
  const configuredPath = directory ?? (env.TREG_CALL_LOG_DIR || undefined) ?? (env.NODE_ENV === 'production' ? '/data/treg-calls' : '.local/treg-calls');
  const logDirectory = typeof configuredPath === 'string' && configuredPath.trim() && configuredPath.length <= 4096
    && !/[\u0000-\u001f]/.test(configuredPath) ? resolve(configuredPath) : null;
  const values = [...secretValues, ...Object.entries(env).filter(([key]) => /(?:TOKEN|SECRET|PASSWORD|(?:^|_)KEY(?:_|$)|CREDENTIAL)/i.test(key)).map(([,value]) => value)]
    .filter(value => typeof value === 'string' && value.length).flatMap(value => [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value)]);
  const secrets = [...new Set(values)].sort((a,b) => b.length - a.length);
  const redactText = value => {
    let result = value;
    for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
    // Recognizable credentials may be returned by a provider even when this
    // server did not configure their value. Keep them out of raw error text too.
    result = result.replace(/\b(authorization|proxy[-_]authorization|cookie|set[-_]cookie)\s*[:=]\s*[^\r\n]*/gi, '$1: [REDACTED]')
      .replace(/\b(?:Bearer|Basic)\s+[a-zA-Z0-9._~+\/=-]+/gi, '[REDACTED]')
      .replace(/(?<![a-zA-Z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s\/@:]+:[^\s\/@]+@/gi, '$1[REDACTED]@');
    return result.replace(/(?<![a-zA-Z0-9_-])(["']?([a-zA-Z0-9_-]{1,120})["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]&]+)/g,
      (match, prefix, key) => secretKey(key) ? `${prefix}"[REDACTED]"` : match);
  };
  function redact(value, state, depth = 0) {
    if (depth > 64) { state.applied = true; state.depthLimited = true; return '[DEPTH LIMIT]'; }
    if (typeof value === 'string') { const text = redactText(value); if (text !== value) state.applied = true; return text; }
    if (Array.isArray(value)) return value.map(item => redact(item, state, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => {
      const safeKey = redactText(key);
      if (safeKey !== key) state.applied = true;
      if (secretKey(key)) { state.applied = true; return [safeKey, '[REDACTED]']; }
      return [safeKey, redact(item, state, depth + 1)];
    }));
    return value;
  }
  const stamp = () => { const value = now(); return (value instanceof Date ? value : new Date(value)).toISOString(); };
  async function checkedDirectory(expected) {
    if (!logDirectory || logDirectory === parse(logDirectory).root || logDirectory === resolve('.') || dirname(logDirectory) === logDirectory) throw Error();
    await mkdir(logDirectory, { recursive: true, mode: 0o700 });
    const stat = await lstat(logDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || typeof process.getuid === 'function' && stat.uid !== process.getuid()
      || expected && (expected.dev !== stat.dev || expected.ino !== stat.ino)) throw Error();
    const handle = await open(logDirectory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const actual = await handle.stat();
      if (!actual.isDirectory() || actual.dev !== stat.dev || actual.ino !== stat.ino) throw Error();
      await handle.chmod(0o700);
    } finally { await handle.close(); }
    return stat;
  }
  // Advance an open directory cursor across requests. Each attempt inspects at
  // most 1000 entries, while later attempts reach expired files beyond page one.
  let pruneCursor = null, maintenance = Promise.resolve();
  async function prunePage() {
    let scanned = 0, removed = 0, capped = false;
    if (!pruneCursor) pruneCursor = await opendir(logDirectory);
    try {
      while (scanned < maximumScan) {
        const entry = await pruneCursor.read();
        if (!entry) { await pruneCursor.close(); pruneCursor = null; break; }
        scanned++;
        if (!ownFile.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) continue;
        const path = join(logDirectory, entry.name), stat = await lstat(path);
        if (stat.isFile() && !stat.isSymbolicLink() && Date.parse(stamp()) - stat.mtimeMs > retentionMs) { await unlink(path); removed++; }
      }
      capped = scanned === maximumScan;
    } catch {
      if (pruneCursor) { try { await pruneCursor.close(); } catch {} pruneCursor = null; }
      throw Error();
    }
    return { scanned, removed, capped, retentionDays: 7 };
  }
  function prune() {
    const task = maintenance.then(prunePage);
    maintenance = task.catch(() => {});
    return task;
  }
  async function begin(request) {
    let file, logId;
    try {
      const directoryStat = await checkedDirectory();
      const retention = await prune();
      logId = randomUUID(); file = join(logDirectory, `${logId}.jsonl`);
      const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await handle.chmod(0o600); } finally { await handle.close(); }
      let appendFailed = false;
      async function append(type, data) {
        if (appendFailed) return fail();
        try {
          if (!['request', 'response', 'lookup_outcome', 'import_outcome'].includes(type)) return fail();
          await checkedDirectory(directoryStat);
          const redaction = { applied: false, depthLimited: false };
          const safeData = redact(data, redaction);
          const encoded = JSON.stringify({ version: 1, logId, at: stamp(), type,
            complete: !redaction.depthLimited && !(type === 'response' && (data?.truncated || data?.error || data?.complete === false)),
            redacted: redaction.applied, depthTruncated: redaction.depthLimited,
            redaction, data: safeData }) + '\n';
          if (Buffer.byteLength(encoded) > maximumEventBytes) { appendFailed = true; return fail(); }
          const output = await open(file, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
          try {
            const stat = await output.stat();
            if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600
              || typeof process.getuid === 'function' && stat.uid !== process.getuid()) { appendFailed = true; return fail(); }
            await output.writeFile(encoded); await output.sync();
          } finally { await output.close(); }
          return { status: 'ready' };
        } catch { appendFailed = true; return fail(); }
      }
      const started = await append('request', { ...request, retention });
      if (started.status !== 'ready') return fail();
      const directoryHandle = await open(logDirectory, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      return { status: 'ready', session: Object.freeze({ logId, append }) };
    } catch { return fail(); }
  }
  return Object.freeze({ begin, async close() { await maintenance; if (pruneCursor) { await pruneCursor.close(); pruneCursor = null; } } });
}
