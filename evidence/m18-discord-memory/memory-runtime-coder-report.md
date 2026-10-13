# Discord memory RPC runtime budget

- Milestone / role / scope: M18 / coder / bounded runtime follow-up after the optimized hosted RPC still hit its inherited statement timeout.
- Starting evidence: parent reports optimized REST invocation HTTP 500/code 57014 near 9.2 seconds, and a direct hosted diagnostic that published the same classification in roughly 35.4 seconds. These are parent operational observations, not commands performed by this coder.
- Inputs inspected: migration 004 and existing policy/period contracts, Discord store, independent memory fixtures, rolling milestone/to-do state, and official Supabase/PostgREST documentation.
- Changed files: new `supabase/migrations/202610120005_discord_memory_runtime_budget.sql`, `server/discord/store.js`, and this report. Applied migrations 003/004, tests, shared journal and cloud services remain untouched.

## Implemented behavior

Migration 005 attaches `statement_timeout=60s` and `work_mem=16MB` only to
`public.discord_rebuild_memory(text,bigint,timestamptz)`. It does not replace the
function body, change its access grants or security mode, modify roles/database
defaults, or change tier definitions and transaction guards. A schema-cache reload
notification lets PostgREST refresh the function settings.

The private store RPC helper now chooses a 65,000 ms HTTP abort deadline only for
the `discord_rebuild_memory` endpoint. Every other RPC keeps its existing 12,000 ms
deadline. External cancellation remains combined with that deadline; response
limits and sanitized failure handling remain unchanged.

[Supabase's function-level timeout documentation](https://supabase.com/docs/guides/database/postgres/timeouts)
documents this approach for recurring REST functions with longer runtime needs.
[PostgREST's hoisted function settings](https://docs.postgrest.org/en/stable/references/transactions.html#hoisted-function-settings)
explain how function timeout settings override connection/impersonated defaults.
Its [configuration documentation](https://docs.postgrest.org/en/stable/references/configuration.html#db-hoisted-tx-settings)
lists `statement_timeout` among the default hoisted settings. `work_mem` applies
inside the function while its existing sorting/grouping statements execute.

## Actual verification

- `node --input-type=module` with real PGlite + pgvector: all five migrations
  applied. Captured `prosrc`, `proacl`, `prosecdef` and every role's `rolconfig`
  before/after 005; body, grants, invoker mode and role settings were unchanged.
  The function retained its empty `search_path` and gained exactly the requested
  60-second and 16 MB settings.
- The same five-migration fixture verified anonymous invocation remains denied
  and a service invocation without the required current policy still fails closed.
- A local `AbortSignal.timeout` spy with injected fixture HTTP responses verified
  rebuild uses 65,000 ms and policy retrieval uses 12,000 ms. An already-aborted
  external signal returned `aborted` before performing another request or creating
  another timeout.
- `node --check server/discord/store.js`: passed.
- `node --test tests/discord-store.test.mjs`: 5/5 passed.
- `node --test tests/discord-memory.test.mjs`: 18/18 passed with the then-current
  four-migration fixture. Its unchanged representative scale acceptance stayed
  below 15 seconds: 2,064.3 ms initial and 2,295.3 ms repeated publication.
- `npm run build:api` and `git diff --check`: passed.
- Additional `node --input-type=module` comparison used the independent skewed
  108,828-original/216-source seed without `ANALYZE`: ran classification with
  migration 004, then applied 005 and repeated as `service_role`. Result JSON and
  every source/tier/period/count were identical: 108,828 memberships and 3,139
  buckets. The five-migration invocation took 2,232 ms, preserving the existing
  15-second acceptance budget. Independent tester owns persistent tests/evidence.

## Handoff and limitations

No hosted write or deployment was performed. Root should journal and independently
review this pass, apply the new migration, verify the hosted function settings and
rerun the real REST classification with the updated store. PGlite validates SQL
attributes and unchanged local behavior; it does not run PostgREST or establish
hosted timeout hoisting/latency. Successful recurring operation still requires a
real hosted request to finish within 60 seconds. The original 15-second local
performance acceptance budget remains unchanged. Root owns folder guides and
shared tracking updates.
