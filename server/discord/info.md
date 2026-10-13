# Discord collection and summary workers

This folder contains separate one-shot workers for Discord REST collection and
Luna summarization. Credentials stay in the ignored environment file or private
Railway variables. Neither worker posts Discord messages or joins private threads.
A successful scheduled collector exits normally; it does not keep a Gateway
connection or Discord online presence.

The client, config, CLI and sync modules check bot access, collect text and source
links, and save atomic resumable checkpoints. Discovery enrolls accessible text
channels and threads automatically. Category and channel exclusions cover their
descendants; missing or ambiguous ancestry fails closed. Images are scrubbed and
attachment bytes are never downloaded. Embeddings are disabled.

The memory module supplies legacy date-group metadata for raw originals. These
buckets do not contain AI summaries or duplicate message bodies. Actual retention
is controlled by the summary schedule and database: keep the current New York
Monday–Sunday week as individual messages, earlier completed weeks in the current
month as per-channel weekly summaries, and older months as per-channel monthly
summaries. Current-week raw survives month boundaries until the next Monday can
complete the prior monthly record. Names accompany channel IDs.

The summary config, provider, runner, CLI and store modules use exactly gpt-6-luna
through OpenAI Responses. They send text only, select one final structured answer,
validate original citations and preserve whole-response usage accounting. Complete
canonical input segments and the map/reduce ancestry must pass database validation
before atomic publication removes their originals and temporary processing bodies.
Cached valid stages survive interruption. Compacted ranges prevent re-importing
consumed history. The original operation and its budget remain intact on resume.

Execution RPCs have scoped 55-second SQL/lock budgets and 60-second HTTP deadlines;
publication retains its 60/65-second budget. Metadata reads stay short. Applied
migrations are immutable and never run at worker startup. Service tables force RLS;
readers need trusted backend scope and explicit source grants. Discovery grants no
member access. Member authentication and production RAG wiring remain unresolved.

These summaries are stored for permission-aware RAG, with no daily AI summaries,
briefings, automatic context injection or Discord posting. Monday and first-of-month
runs are gated at 08:00 America/New_York. Daily collection has its own schedule.
Root owns live rollout and shared documentation. See the rolling milestone for
actual backfill progress, deployment evidence and outstanding verification.

The original bootstrap and Monday rollover completed on Railway. The latest
storage snapshot has 673 monthly summaries, 49 weekly summaries and four raw
messages from October 12–18, with zero older raw. Root-executed terminal storage/permission checks and independent artifact
analysis passed. Both workers finish as successful one-shot
jobs. Daily collection has executed; summary cron configuration matches its
effective image, but a scheduled summary invocation has not been verified.

Bounded token-truncation recovery passed 80 provider and 11 cache checks, API
build and independent review. It permits one freshly reserved 6,400→12,800 retry
only for explicit eligible token-limit truncation within the original attempt and
spending caps. Default output, byte limits and cache version remain unchanged.

Developer MCP now requires reauthentication; the already-authenticated CLI and
server runtime connection work. The terminal SQL ran under SET TRANSACTION READ
ONLY; the guarded reader was tested separately through its existing runtime API.
No grants, credentials or schema changed during the audit. Reports attribute
root execution separately from independent tester/evaluator analysis.
