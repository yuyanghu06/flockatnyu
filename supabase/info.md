# Supabase schema

This folder contains immutable applied SQL migrations and migration guidance. The current hosted schema retains five service-only public tables:

- `discord_view_policies`: Discord policy and channel/thread metadata catalogue.
- `knowledge_sources`: Miro and other non-Discord source registry.
- `miro_boards`: original board objects/layout/relationships and sync metadata.
- `agent_input_cache`: temporary input buffer with exactly `uuid` and `raw_response` JSONB.
- `agent_automation_state`: metadata-only queue/lease/action receipts and Gmail watch/history or Discord committed-session checkpoints.

All force RLS and deny direct browser access. Backend source scope and administrator checks remain; per-person membership tables are retired. Source bodies belong only in the explicitly authorized Miro snapshot or temporary input buffer. Discord originals and summaries are read/generated live in request memory, with no durable archive/vector/fallback tables. The independent Discord Gateway collector writes scoped new events into the temporary cache, without restoring historical archiving.

Migrations013–017 record the historical storage/membership retirement and single Discord catalogue cutover. Migrations018/019 add shared temporary inputs and separate metadata state. Hosted018/019 versions are `20261017182014` and `20261017182143`; their definitions and service-only permissions have recorded independent verification. Earlier SQL must remain intact for audit and migration fixtures, even where later migrations remove its objects.

Local filenames and hosted migration receipts have different prefixes. Read [migrations/info.md](migrations/info.md) before deliberate schema work; never replay this directory with ordinary `db push`, and never apply schema at service startup. SQL alone does not install collectors, run an LLM, enable cleanup or grant source access.

Runtime clients use server-only Supabase credentials; developer MCP OAuth is separate. No key may use `VITE_`, enter browser code or be printed. Exact successful snapshot IDs control cache cleanup through the trusted automation handler; Gmail receipt alone does not mean an input was processed. See [current tables](../docs/database-tables.md), [automation](../docs/agent-automation.md) and the [milestone snapshot](../milestones/milestone.md) for evidence and operational limits.

Migration020 is applied as20261017184647. It preserves explicit manual Discord disables through discovery using existing channel JSONB. Table/column/ACL boundaries, source UUIDs, unrelated data and other functions were verified unchanged.
