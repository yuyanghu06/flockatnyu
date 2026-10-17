# Current database tables

Hosted Supabase retains five public tables after migrations018/019. All force RLS and deny direct browser access; backend credentials and source policy remain server-only.

| Table | Purpose |
| --- | --- |
| `discord_view_policies` | One row per Discord server: channel/thread catalogue in `channels` JSONB, stable source UUIDs, view/exclusion policy and metadata discovery checkpoints. No message bodies. |
| `miro_boards` | One row per board: original objects, text, layout and relationships in `data` JSONB, plus source/configuration, freshness and sync lease controls. |
| `knowledge_sources` | Shared registry for Miro and other non-Discord sources. Discord identities live in the Discord catalogue instead. |
| `agent_input_cache` | Temporary shared input buffer with exactly `uuid` and `raw_response` JSONB. The authorized Gmail receiver enqueues email provider payloads here. |
| `agent_automation_state` | Metadata-only queue identities, leases, cooldown/action receipts and Gmail watch/history checkpoints. No source bodies. |

There are no per-person membership tables. Trusted backend source allowlists and administrator checks still apply. Shared database access does not grant a collector arbitrary source scope.

Assistant Discord reads and generated summaries exist only in request memory. Native new/edit/delete events can remain in the temporary shared input queue until explicitly handled. The separate `discord-events` collector enforces inherited channel/category blacklists; its metadata refresh replaces the old daily cron. Historical content/summary/vector/accounting/job tables remain removed.020 preserves manual disables in existing catalogue JSONB without adding tables or columns.

Cache cleanup requires explicit successfully handled snapshot IDs from the trusted handler. An active Gmail receiver does not itself run an LLM or remove successfully received input as processed. The LLM service and concrete map/Calendar write adapters are inactive. See [automation](agent-automation.md) for the processing contract.

Migrations018/019 and service-only permissions have hosted verification recorded in the [milestone snapshot](../milestones/milestone.md). Applied migrations remain immutable; consult [migration guidance](../supabase/migrations/info.md). Current source behavior is documented in [live-only Discord](discord-live-only.md), [Google](google-connector.md) and [Miro](miro-sync.md).
