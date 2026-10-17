# Miro daily sync worker

This independent, one-shot Node worker reads only explicitly configured boards.
It does not write to Miro, invoke models, generate embeddings or expand the backend source allowlist. The parent deployment configuration supplies the Railway cron and server
credentials. No source or API response content is written to logs.

- `config.js`: validated board IDs or Miro board URLs, optional team restriction,
  safe resource limits, and the America/New_York 6 AM scheduling gate.
- `client.js`: fixed-origin, redirect-denying Miro GET requests, typed detail
  hydration, timeouts, retry and byte/request/page budgets. Public methods return
  raw objects/pages; callers of live assistant reads must authorize the source.
- `snapshot.js`: exhaustive items, typed details, connectors, groups/memberships,
  offset-paginated tags and card/sticky tag associations. Raw HTML, coordinates,
  unknown fields and original generic listings survive. Board modifiedAt is read
  before/after with a bounded complete retry. A stable content hash omits capture
  metadata. This is best-effort API coverage, not a transactional visual export.
- `store.js`: service-role-only migrations 012–016 RPC adapter, scoped shared read RPCs,
  leases, atomic publication and status-only failure recording. Migration 014 keeps
  one row per board and moves the intact snapshot to `data` JSONB, leaving 12
  columns for identity, source scope, revision consistency, freshness and leases.
  Metadata, object counts, coverage and capture times remain inside `data` instead
  of duplicate columns. Authorized read responses derive title/URL, with `data`
  as the payload key; trusted source allowlists and active source/board checks apply.
  The finish RPC keeps `p_snapshot`/`p_content_hash` for deployed-worker compatibility;
  the hash is validated but no longer stored.
- `sync.js`: source registration without expanding reader scope, per-board leases renewed on
  progress and before publication, all-or-nothing per-board capture, continuation
  after board failures, and a global runtime deadline.
- `cli.js`: `scheduled`, `sync` (manual schedule bypass), or `preflight` (Miro
  metadata reads only; no database writes and no database-connectivity claim).

Use Node 22.12+ and server-only MIRO_ACCESS_TOKEN, MIRO_BOARD_IDS, optional
MIRO_TEAM_ID, MIRO_SYNC_ENABLED=true, SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY. By default synchronization is disabled. Missing token
or board scope fails closed when enabled. No broad account/team discovery occurs.
A supplied board URL contributes only its validated ID; its host is never fetched.

This worker expects a non-expiring token created for a Miro app with boards:read.
It does not refresh OAuth tokens. Expiring tokens need a separate refresh lifecycle
before unattended use. Miro supports selecting token expiry at app creation:
https://developers.miro.com/reference/authorization-flow-for-expiring-tokens

Railway should invoke `node server/miro/cli.js scheduled` with UTC cron
`0 10,11 * * *`; only the 6 AM New York invocation runs across daylight saving.
Manual catch-up uses `node server/miro/cli.js sync`. Overlapping captures cannot
publish with stale lease tokens/configuration revisions. On any incomplete page,
missing required detail/relationship read or exceeded limit, the prior published
snapshot remains intact. HTTP 401/403/404 marks inaccessible data through the
store failure RPC; source permission decisions still belong to the database.

API references checked 2026-10-15: get-items-1, get-card-item-1,
get-connectors-1, get-all-groups, getitemsbygroupid, get-tags-from-board and
get-tags-from-item at https://developers.miro.com/reference/ (including current
OpenAPI definitions). Item tags use a tags array; board tags use offset/total;
group membership uses groups/items?group_item_id=. The exported
normalizeGroupPage helper flattens documented nested envelopes, exhausts exposed
cursors and refuses ambiguous or unrepresentable nested continuations. No arbitrary response URLs
or linked card documents are followed. Unsupported/hidden objects, comments,
external document contents, exact Miro rendering and concurrent edits remain
coverage caveats. Calendar interpretation is a separate future step.

M28 shared access: migration016 removes membership joins. Readers use only trusted
server source scope, active source/board state and existing configuration checks;
p_member_id is accepted solely for wire compatibility. No per-person grant is required.

M27 activation repair parses numeric JSON id lexemes exactly using Node22.12+ reviver source, preserving unrelated numbers. Group membership slices merge into canonical groups while original groupPages/groupItemPages remain in snapshot data. Structural groups/memberships are validated before expensive typed hydration; publication stays atomic.

Large-board captures may use the existing MIRO_MAX_RUN_MS override up to one hour; the configured schedule board uses3600000ms after real capture measurements. Other byte/object/request bounds remain unchanged.
