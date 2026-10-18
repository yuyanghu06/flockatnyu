# Chat production fixes plan accepted

- Local timestamp / acting role / milestone: 2026-10-18T18:58:20.608083-04:00 / planner and orchestrator / chat production fixes.
- Requested scope: fix repeated production bug-report failures and mark named people going when chat explicitly says they will attend/help at an existing event.
- Starting state: concurrent Miro quota and spotlight verification work preserved.
- Evidence: independent planner reproduced one saved bug report followed by six conflicting rewritten retries under one request UUID; existing four bug-report tests passed. Hosted web configuration and report table available; invalid-null RPC preflight returns expected23514, table read200; no report written.
- Accepted plan: one bug-report attempt per current user message; dedicated named-person attendance tools with unique roster/event resolution, request-local current-message authority, fresh complete snapshots and optimistic writes. Existing event source UUID supplies access scope only; strict server-generated app URL distinguishes chat attendance provenance from provider originals, with current original-event authorization. Generic map upserts retain original-source/exact-provider-identity gates. No schema, Calendar, Miro or catalogue writes.
- Ownership: attendance coder owns new attendance service/tool, source authorization and core tests; orchestration coder owns intent, chat prompt/results/loop and report/orchestration tests; parent owns runtime composition, guides, journal and release. No child agents.
- Acceptance: once-only success/failure reports, unambiguous screenshot-equivalent attendance, ambiguity/negation/first-person/stateless/source-revocation/conflict negatives, existing map projection and production release verification.
- Remaining work: implementation, independent verification/review, isolated web deployment and worker compatibility as required.
