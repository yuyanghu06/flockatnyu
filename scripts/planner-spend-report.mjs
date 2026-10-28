// Read-only, private metadata report. Usage: node --env-file=.env scripts/planner-spend-report.mjs --days=3
import { pathToFileURL } from 'node:url';
import { summarizePlannerSpend } from '../server/audit/planner-spend-report.js';

const selections = {
  agent_model_calls: {
    field: 'started_at',
    id: 'call_id',
    select:
      'call_id,agent,run_id,provider,model,operation,provider_base_host,service_tier,status,started_at,http_status,usage,estimated_cost_usd,pricing_basis',
  },
  agent_audit_events: {
    field: 'created_at',
    id: 'event_id',
    select: 'event_id,agent,run_id,kind,tool,status,counts,created_at',
  },
};

export async function collectPlannerSpend({
  env = process.env,
  fetchImpl = globalThis.fetch,
  start,
  end,
}) {
  let base;
  try {
    const parsed = new URL(env.SUPABASE_URL);
    if (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      ['', '/'].includes(parsed.pathname)
    )
      base = parsed.origin;
  } catch {
    /* Configuration errors never echo private values. */
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key))
    throw new Error('Private audit configuration unavailable');
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(start) >= Date.parse(end)
  )
    throw new Error('Invalid spending window');
  const headers = { apikey: key, authorization: `Bearer ${key}` };
  const receipts = [];
  async function read(table) {
    const { field, id, select } = selections[table],
      rows = [];
    let expected;
    for (let offset = 0; offset <= 200000; offset += 1000) {
      const url = new URL(`/rest/v1/${table}`, base);
      for (const [name, value] of Object.entries({
        select,
        agent: 'eq.planner',
        [field]: `gte.${start}`,
        and: `(${field}.lt.${end})`,
        order: `${field}.asc,${id}.asc`,
        offset: String(offset),
        limit: '1000',
      }))
        url.searchParams.set(name, value);
      const response = await fetchImpl(url, {
        redirect: 'error',
        headers: { ...headers, ...(offset === 0 ? { Prefer: 'count=exact' } : {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Audit metadata read failed (HTTP ${response.status})`);
      if (offset === 0) {
        const count = response.headers.get('content-range')?.split('/').at(-1);
        if (!/^\d+$/.test(count ?? '')) throw new Error('Exact audit count unavailable');
        expected = Number(count);
        if (expected > 200000) throw new Error('Audit window exceeds report row bound');
      }
      const body = await response.text();
      if (Buffer.byteLength(body) > 8 * 1024 * 1024)
        throw new Error('Audit metadata response exceeds bound');
      const page = JSON.parse(body);
      if (!Array.isArray(page) || page.length > 1000)
        throw new Error('Invalid audit metadata page');
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const unique = new Set(rows.map((row) => row[id]));
    if (unique.has(undefined) || unique.size !== rows.length || rows.length !== expected)
      throw new Error('Incomplete audit pagination; retry with a fixed window');
    receipts.push({ table, rows: rows.length, exactCount: expected, paginationComplete: true });
    return rows;
  }
  const calls = await read('agent_model_calls'),
    events = await read('agent_audit_events');
  return {
    ...summarizePlannerSpend({ calls, events, start, end }),
    collectedAt: new Date().toISOString(),
    collection: receipts,
  };
}

async function main() {
  const flags = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const match = /^--(start|end|days)=(.+)$/.exec(arg);
      if (!match) throw new Error('Use --start=ISO --end=ISO or --days=number');
      return [match[1], match[2]];
    }),
  );
  const days = Number(flags.days ?? 7);
  if (!Number.isFinite(days) || days <= 0 || days > 7)
    throw new Error('Days must be greater than zero and at most seven');
  const end = flags.end ?? new Date().toISOString();
  const start = flags.start ?? new Date(Date.parse(end) - days * 86400000).toISOString();
  const report = await collectPlannerSpend({ start, end });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(
      'Planner spending report failed; verify private configuration and the audit window. No private response was printed.\n',
    );
    process.exitCode = 1;
  });
}
