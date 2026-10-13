# Ordered database migrations

Migrations001–010 have been applied to Tech NYU project jssehnrmqhstcrtxulpa.
Their bodies are immutable. Hosted MCP versions differ from local filename
prefixes: reconcile the mapping before CLI migration work, never replay them with
an ordinary db push, and never run migrations from worker startup.

| Number | Purpose | Hosted version |
| --- | --- | --- |
| 001 | Knowledge records, source grants and retrieval foundation | 20261011200346 |
| 002 | Discord raw archive, operator and resumable checkpoints | 20261011200348 |
| 003 | Automatic discovery, exclusions and raw date-group metadata | 20261011205557 |
| 004 | Efficient atomic publication of raw date groups | 20261011213945 |
| 005 | Scoped rebuild timeout and work memory | 20261011214737 |
| 006 | Calendar summaries, coverage certificates, caches, accounting and atomic pruning | 20261011232316 |
| 007 | Remove a late wide-row join without changing canonical input | 20261011233820 |
| 008 | Historical planning budget increase, subsequently superseded by009 | 20261011235513 |
| 009 | Durable per-channel/period planning and accounted stale recovery | 20261012003929 |
| 010 | Scoped execution SQL/lock budgets for large claims and lock waits | 20261012023824 |

Raw retention uses the current America/New_York Monday–Sunday week. Completed
earlier weeks in the current month become one weekly summary per channel; older
months become one monthly summary per channel. Atomic verified publication alone
removes replaced raw records, revisions and processing bodies. Minimal provenance,
original citation links and usage receipts remain. Compacted ranges prevent the
collector from resurrecting consumed history. Names accompany channel IDs.

Migration009 avoids global canonical replay by preparing one frozen source/period
at a time. Charged stale recovery retains its operation ID, budget and receipts.
Migration010 changes only function settings: nine execution/helper functions use
55-second statement and lock limits, while finish retains its60-second statement
limit and16MB work memory with a55-second lock limit. Roles, global settings,
function bodies, ACLs, tables and RLS are unchanged.

Tables force RLS and execution is service-only. No reader grants or embeddings
were enabled by this work. Current hosted backfill and scheduler state belongs in
the rolling milestone; this guide describes the schema and migration boundaries.
