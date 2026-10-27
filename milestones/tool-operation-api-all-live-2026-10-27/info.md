# All-operation live API and agent verification

Goal: verify the 54 named operations and common member tasks using real model
choices, real providers, exact test records and cleanup. The manually editable
task catalogue is [docs/agent-tasks.md](../../docs/agent-tasks.md). Preserve its
stable IDs and manual additions; append dated evidence.

Current result: 45 of 54 operation names have successful model-selected live
calls. All 54 have separate offline transport checks. Calendar, Contacts, Treg,
Attio, Discord, Miro and map workflows have recorded successful variants. Shared
memory save used unchanged content. Gmail accepted the test message and it was
found in Sent; delivery was not established.

Exactly one approved normal production cycle handled 3 claimed inputs and
released its lease. The separate sync returned partial; follow-up reached its
round limit. The user declined more worker test cycles. Worker Calendar and
Member Plans create/cancel, participation and new task-deferral workflows remain
unverified. Complete live acceptance remains partial or held.

Two chat-cache corrections allow fresh reads after writes and retry of an action
that was rejected for a missing read after the model supplies that read.
Successful and uncertain writes remain protected against replay. Independent
regressions and live Calendar/Contacts recovery pass.

All disposable Calendar, Contacts, Attio and map fixtures were cleaned as
recorded. One labeled Discord marker, append-only bug report and requested test
email remain. Source permissions, versions, budgets and logging boundaries are
unchanged. No release, schema, credentials, deployment or remote configuration
was changed.

[Verification and limits](verification.md) · [Every operation](coverage.md).
Private source-free evidence remains ignored under evidence/. Final independent
review ACCEPTS the scoped fixes and qualified evidence; the full live milestone
remains partial/held. Its records are linked from the milestone journal.
