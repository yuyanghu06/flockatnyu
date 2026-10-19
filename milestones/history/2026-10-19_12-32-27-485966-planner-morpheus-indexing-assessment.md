# Morpheus indexing assessment

- Local timestamp / acting role / milestone: 2026-10-19T12:32:27.485966-04:00 / independent planner / Morpheus read-only feasibility review.
- Requested scope: assess reuse for Flockbot indexing and direct Discord interaction alongside website; no implementation.
- Starting repository state: production feedback/audit work and existing user changes preserved. Morpheus inspected in an isolated /tmp checkout at 01e6700269e48c113a5b1fd4447f9e7e558b42f1.
- Work performed / changed files: source/test/documentation inspection only; orchestrator records this report in journal. No application/config/schema changes.
- Decisions and findings: Actual FTS5/BM25 search, strict/loose keyword recall, workspace/channel/thread/date filters, virtual tree/read/poll and Google-link discovery are implemented. This is not embeddings or linked-document content indexing. Current Flock already delegates keyword search to Discord's index. The optional archive may avoid some live window fetches but no latency/cost benchmark was run.

Material findings: append-only Markdown retains prior edited/deleted text and raw-file API exposes it; hard prefilter before upsert can leave stale short edits; bounded reconciliation does not guarantee complete deletion capture. Morpheus workspace scopes differ from Flock's source UUID/current policy/team opt-in boundaries. Bun SQLite/FTS/filesystem imports require adaptation to Node/Hono/Supabase. Recommend selective utilities and optional later scoped Postgres index only after an explicit retention decision.
- Checks and evidence: read-only rg, cat, sed, nl and git status; current AGENTS, notes, milestone/to-do and workflow read. Source/test fixtures inspected, not executed; no installs, model calls, bot source reads, service changes or deployments.
- Resulting state / acceptance: bounded comparative review complete; proposed work remains unapproved.
- Remaining work and handoff: independent synthesis review and user decision. No implementation follows from the assessment.
