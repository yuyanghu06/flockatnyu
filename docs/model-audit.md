# Private planner and chat audit

The October 19 user request authorizes a private operational record of model calls
and returned agent outputs for both the chat agent and autonomous planner/update
agent. This narrowly adds retained model outputs to the earlier content-free
diagnostics boundary. It does not restore Discord summaries or source archives as
assistant knowledge, authorize new source access, or expose logs to members.

`server/model-audit.js` writes service-only `agent_model_calls` and
`agent_audit_events` through migration 033 RPCs. Every production provider dispatch
must first persist a unique call record. If that write fails, the model request is
blocked. A terminal write records success, failure, cancellation or abort,
provider response/request IDs, HTTP/finish/error codes, available input/output and
cache/reasoning token counts, and sanitized model text/tool proposals. Chat native toolTurn planning (or planTools for uploads/legacy providers) and answer streaming share one chat run UUID; each claimed planner batch
has a separate run UUID and round numbers, independent of queue leases.

The provider may make up to three HTTP attempts for a transient rejection or
transport failure before accepting a response. Each attempt has its own durable
call UUID and terminal record, while retaining the invocation's run, round and
operation. Attempts share the original deadline. Successful response parsing or
streaming is never restarted, and a logging completion failure does not cause
another inference. Totals must count all dispatched attempts; missing usage on a
failed attempt remains unknown. This changes no audit schema or retention rules.

Run and tool lifecycle events record names, actual status codes, numeric counts
and durations. They contain no tool arguments or response bodies. Model-generated
tool proposals are retained before business validation or chat's proposal slice.
Partial streamed text is saved on normal cancellation or parser failure. Retained
output is bounded to 512 KiB per model call with truncation/redaction metadata.
Hidden model reasoning is not available and is not logged. Prompts, conversation
inputs, uploads and raw source tool responses do not enter audit storage.
Configured secrets and common credential patterns are redacted before
persistence; unknown secrets cannot be guaranteed detectable. Never paste private
audit output into committed evidence.

Missing token counts remain null. Interrupted requests may have been billed
without returning usage. Provider requests and database results cannot commit
atomically: a crash or terminal logging outage leaves an unresolved `started`
record. The last streamed output can be lost on abrupt process death. Logging
failures emit content-free diagnostics and preserve the original provider result.

Cost values are estimates with a versioned price basis, not invoices. Known
direct OpenAI GPT-6 Luna standard/default pricing uses the October 19 official
rate card; unknown models, hosts, tiers, incomplete usage or input over272,000tokens
leave cost null. Cache reads/writes are exclusive subsets of total input and
use their own rates rather than an added write fee. [Official pricing](https://developers.openai.com/api/docs/models/gpt-6-luna).
OpenAI streaming requests the final usage frame, which may be absent after an
interruption. [Streaming usage](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events).
Historical spending before this feature cannot be reconstructed from it.

Audit tables force RLS and deny public/anonymous/authenticated access. The service
role may read them and execute the fixed audit RPCs, with no direct table mutation
grants. There is no frontend endpoint or model retrieval tool. Operational totals
must count null usage and unresolved calls alongside any known-cost subtotal.

Default retention is seven days, set by the database. Both live runtimes prune
expired records on startup and hourly using bounded deletion. Expired rows may
remain until maintenance runs; deletion is not guaranteed to the exact second.
Production always requires audit storage; `MODEL_AUDIT_ENABLED=false` cannot bypass
it. Development recording is opt-in through `MODEL_AUDIT_ENABLED=true`;
`MODEL_AUDIT_REQUIRED=true` enforces it in other environments.
`MODEL_AUDIT_TIMEOUT_MS` bounds storage operations. Existing private Supabase
server credentials are reused. Rollout status lives in `milestones/milestone.md`.

Tool and run diagnostics now add versioned fixed reason/stage/outcome and schema-field codes to existing numeric counts, with safe human-readable Railway mirrors. Predispatch rejects are separate from actual execution. Calendar batches persist the primary item cause and aggregate counts; full sanitized per-item detail is Railway-only. No migration, broader retrieval or changed seven-day retention is introduced. See [tool failure logging](tool-failure-logging.md) for historical coverage, code decoding and failure-rate denominators.


Staged-cycle execution history is distinct from these operational audit tables: actual selected API results/source context stay in bounded run memory and temporary039task checkpoints for the final phase. Operational audits retain their existing content-free run/tool outcomes and model outputs only, with no assistant-facing retrieval.
