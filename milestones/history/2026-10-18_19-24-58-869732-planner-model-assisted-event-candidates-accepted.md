# Model-assisted event candidate plan accepted

- Local timestamp / acting role / milestone: 2026-10-18T19:24:58.869732-04:00 / planner and orchestrator / attendance resolution follow-up.
- User steering: event resolution should use fuzzy matching or load the event list rather than hiding everything behind direct string matching.
- Finding: the service already reads authorized events, but title filtering withheld candidates from the model. Formatting-only fix ced09e4 is deployed as web9a9b9523; this next pass improves the resolution architecture.
- Accepted behavior: normalized unique matches remain direct; multiple normalized matches remain ambiguous. With no normalized match, return the authorized/date-filtered eligible catalogue ranked by title similarity, not a confidence claim. A complete list up to20events allows model selection using actual title/date/context; uncertainty asks clarification. Larger lists are explicitly incomplete and cannot authorize a write until narrowed.
- Safety: selection receipts bind returned event ID/title/source/revision and unique fixed roster person. Fresh access/date/concurrency checks and attendance-only mutation remain; no fuzzy person matching, provider identity invention or event creation.
- Ownership: attendance coder owns service/core tests; orchestration coder owns context/tool guidance and orchestration tests. Parent owns integration, journal, model/live verification and deployment.
- Evidence: planner inspected current code and result sanitizer (which currently drops unknown selection enums). No planner tests/external writes.
- Handoff: implement candidate mode, independently test, verify actual model selects meaningful candidates and defers genuine ambiguity, then redeploy only web.
