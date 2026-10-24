# Overnight planner failure diagnosis

Goal: identify why planner work failed after the October23 catalogue/read release, separating provider rejection, repeated attempts and saved-task checkpoint failures.

Scope: read-only production configuration comparison, existing operational metadata/logs, one bounded audited inference diagnostic with synthetic text, local synthetic storage reproduction and independent review. No billing, source, business-data, deployment or worker-behavior changes.

Confirmed provider state: a diagnostic using the same API key/model/endpoint as the running worker returned HTTP429 with `credit_balance_exhausted` and `insufficient_quota` on October24 at7:47AMNewYork. The original overnight bodies were discarded, so credit exhaustion during the continuous overnight429 sequence is a strong inference; current credit exhaustion is directly confirmed.

Retry findings: all429 errors are treated as temporary and reduced to generic unavailable. Each of461 failed batches made three rejected HTTP attempts. The median batch-start interval was about65seconds. There is no persistent provider pause. Provider failure increments message failure counts; cumulative five failures plus a current singleton batch can quarantine an input for24hours. At7:50AM,57current global queue items were quarantined with unavailable as last outcome; this is not an overnight credit-specific count.

Checkpoint findings:47 failures occurred after initial finish and separate sync.31 database invalid_request rejections support the existing256KiBJSONB limit diagnosis;16 generic failures lack enough detail to assign all to size. The slow complete-backlog read problem is distinct.

Acceptance: identify provider cause with a safe same-configuration probe; trace both retry loops and input accounting in code; separate exact evidence from inference; reproduce the storage boundary locally; obtain independent evaluator review and journal all passes. Final evidence and remaining work are linked from the rolling snapshot.

Recommended next work: restore API credits; classify approved error fields without logging raw bodies; persist a provider pause that preserves queued work without consuming message failure attempts; fix saved-history growth while preserving original context and exact source/hash/version/lease checks. These recommendations are not implemented by this diagnosis.

Completed verification: exact deployed runtime plus real local PostgreSQL reproduced both size paths. With prior245000compact/250042SQLbytes, one source result gives257801compact/262898SQLbytes and the database rejects; two results give270183compactbytes and Node rejects first. Oldtask/200historyrows stay unchanged; new history is not retained, queueack is false and simulated completed-action receipt stays. Zero network/modelrequests in these local cases. This establishes mechanisms, not every historical16generic subtype.

Status: diagnosis complete and independently accepted. Remedy, billing restoration, queue recovery and reliability verification remain pending. See the linked rolling snapshot for final receipts.
