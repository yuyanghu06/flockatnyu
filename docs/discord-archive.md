# Discord archive and summary retention

The REST archive discovers accessible text channels and threads, inherits category/
channel exclusions and saves sanitized originals with resumable checkpoints.
Actual Railway collection and Luna compaction are complete for the accepted
scope. The latest snapshot contains 673 monthly summaries, 49 weekly summaries
and four October 12–18 raw messages, with no older raw. Daily collection has run
across 216 sources. Root-executed terminal retention/permission checks and independent artifact
analysis passed.
See the [milestone](../milestones/milestone.md) and [launch commands](discord-launch.md)
for timestamps, measured evidence and remaining checks.

## Corrected retention

The user superseded indefinite original retention and rolling seven-day windows.
Keep individual messages for the current America/New_York Monday–Sunday week.
For each channel, completed earlier weeks in the current month use one weekly
summary each; older calendar months use one monthly summary each. Store the
channel name alongside its ID on raw messages and summaries. These are RAG
records, retrieved when relevant; there is no automatic summary prompt injection
or proactive briefing. No daily summaries are generated.

Monday08:00 passes compact completed weeks. On the1st08:00, monthly work compacts
the eligible portion of the previous month. A current week that crosses a month
boundary keeps all its originals; after that week ends, the Monday pass completes
that monthly summary using the verified prefix plus the remaining raw tail.
Initial bootstrap goes directly from older raw months to monthly summaries.
Pending raw is preserved until its verified replacement commits successfully.
Calendar/DST/month-boundary implementation passed independent local acceptance.
The initial frozen bootstrap and Monday rollover completed on Railway using
exactly gpt-6-luna. Their combined authoritative database estimate is $4.1100516,
including conservative uncertain-dispatch charges; this is not a provider invoice.
The full terminal audit is separate from operation completion.

## Publication and collection guards

The runner reads every raw or verified-summary input through bounded pagination
and exact canonical segments. Map/reduce coverage is independent of the few
findings cited in concise output. A monthly certificate distinguishes directly
read raw records from original counts represented through prior weekly summaries.
Every finding uses valid original Discord IDs; URLs are derived from trusted
source identities. Prior-summary evidence is not described as reread raw text.

The database verifies current input/dependency fingerprints, lease, policy,
source permissions, complete segment coverage and reduction ancestry. Publishing
the summary/certificate/compacted-range ledger and removing consumed raw,
revisions, temporary input/part content and obsolete weekly summaries is atomic.
Any failure preserves source records. Final summary validity and permissions do
not depend on raw rows that were intentionally removed. Minimal counts/digests,
lineage, citations, model provenance and usage accounting remain.

Per-source compacted ranges prevent historical backfill, overlap and late pages
from resurrecting discarded originals. Incoming identity checks and scanned
checkpoint progress still apply. New sources first collect history normally;
compaction waits for complete requested coverage. Scope resets remove only the
authorized guild archive/ledger/summary state, preserving configuration, operator,
source grants and unrelated data.

## Contents and access

Images and embeddings remain disabled. Text, ordinary links and nonimage file
metadata are retained while raw is recent; no attachment bytes are fetched.
Unknown ancestry fails closed. Private archives require existing bot permission/
membership; the worker never joins threads or sends Discord messages.

Service-only tables force RLS and deny browser writes. Reader RPCs require current
policy/blacklist eligibility, explicit member grants and trusted backend source
scope. Discovery adds no readers. Production member authentication remains
unresolved, so protected production routes fail closed.

Compaction intentionally removes local verbatim historical messages. Original
Discord citation links remain, but deleted/inaccessible source messages cannot be
recovered. Historical edit reconciliation or regeneration from discarded originals
requires an explicit recovery strategy; automatic re-import is prohibited.

## Execution and verification

Luna uses standard processing through OpenAI Responses, structured text JSON and
no tools/images/linked-document fetching. Model attempts reserve cost before
request dispatch; actual and uncertain usage are durable. Cached parts survive
interruption, while terminal compacted operations require no erased-input reread.

Weekly/monthly cron uses UTC 12/13 Monday OR the 1st and a New York 08:00 gate for DST.
Pending applicable operations can resume outside the generation slot. Daily raw
collection is separate. Bounded passes and a durable operation budget stop runaway
requests without replacing an unfinished summary with success. The service and
effective deployed image settings match. Actual scheduled summary execution
remains unverified; successful manual cloud runs do not establish a cron trigger.

Local `npm run test:discord`, `npm run test:assistant` and `npm run build:api`
exercise fixtures; separate hosted evidence proves actual schema, model output,
pruning counts and service execution. Applied001–010 are immutable. Hosted preparation covers695 channel-period jobs
using durable bounded slices; the Monday refresh linked 695 cached jobs and 27 new weekly jobs. Reconcile hosted/local migration prefixes before
CLI migration work and never migrate from worker startup. The current provider
selects one final structured answer, charges whole-response usage including
commentary, and reserves its 6,400-token ceiling before dispatch. Eligible explicit
token-limit truncation permits one newly reserved retry up to 12,800 within the
existing attempt and spending caps. Original
$1 invocation/$5 operation caps and32KiB selected-output limit remain.010 scopes
55-second SQL/lock deadlines to execution functions with60-second HTTP deadlines;
metadata and planning budgets retain their prior limits. No global role timeout
is changed.

References: [Discord messages](https://docs.discord.com/developers/resources/message),
[Railway cron](https://docs.railway.com/cron-jobs),
[Railway scheduling semantics](https://blog.railway.com/p/run-scheduled-and-recurring-tasks-with-cron),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs).

Developer MCP now requires reauthentication; the already-authenticated CLI and
server runtime connection work. The terminal SQL ran under SET TRANSACTION READ
ONLY; the guarded reader was tested separately through its existing runtime API.
No grants, credentials or schema changed during the audit. Reports attribute
root execution separately from independent tester/evaluator analysis.
