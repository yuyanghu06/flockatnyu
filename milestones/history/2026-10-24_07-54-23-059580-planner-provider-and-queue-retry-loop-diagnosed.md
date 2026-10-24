# Provider and queue retry loops diagnosed

- Local timestamp / acting role / milestone: 2026-10-24_07-54-23-059580 America/New_York; planner; overnight planner failure diagnosis.
- Requested scope: read-only explanation of provider retry, queue retry and failure accounting; no edits, external calls or child agents.
- Starting repository state: codex/dev atbac459e; deployed worker a34ade2f unchanged.
- Work performed / changed files: inspected provider dispatch/retry, handler/CLI/store/config and migrations036/038/042; recounted saved operational metadata. No code edits.
- Decisions: two retry loops compound a provider outage. Every429 is classified transient; dispatch retries up tothree times, default waits1s and3s, respecting validRetry-After when within deadline. Failed bodies are discarded and errors reduced to generic unavailable. The serve loop polls5s; the queue has60s globalcooldown but no persistent provider pause.
- Checks and evidence:461 unavailable batches each have3HTTP429 failures=1383. Batch starts are about65s apart. Individual inputs defer5min, so fresh/other due inputs can keep the worker active. Every failedbatch increments input failure count; cumulative>=5 plus a current singletonbatch quarantines24h, preserving exact payload/source/scope guards.
- Resulting state / acceptance: retry mechanism established. Root's separately audited same-key probe confirms current credit exhaustion; historical error subtype remains inferred because bodies were discarded.
- Remaining work and handoff: retain only approved provider error fields; distinguish billing/quota from temporary throttling; persist provider pause and use explicit provider-defer bookkeeping without consuming message failures. Do not substitute shutdown or falsely finish inputs. Recovery preserves current exact source/hash checks. No remedy implemented.
