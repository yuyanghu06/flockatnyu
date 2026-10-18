# Event candidate core implemented

- Local timestamp / acting role / milestone: 2026-10-18T19:32:00.635950-04:00 / coder with orchestrator integration / model-assisted event resolution.
- Scope: user's requested catalogue/fuzzy resolution correction.
- Work and verification: Core returns all authorized eligible/date-filtered fallback candidates ordered by deterministic bigram similarity, without a confidence cutoff. Exact normalized unique matching remains a fast path; multiple exact matches stay ambiguous. Complete lists up to20 authorize request-local returned-event receipts; larger lists are incomplete and cannot write. Candidate writes recheck exact returned title/source identity/revision/date/current access. Safe context is bounded. Later actual-model probes exposed generic workshop guessing and PAWS→AWS guessing; structural guards now deny writes for multiple full-context phrase matches or unsupported single short references while retaining suggestions.35 core tests and68targeted checks pass; API build/whitespace pass.
- Boundaries: no fuzzy roster identity, source expansion, event creation, Calendar mutation or new storage. Write receipts bind exact returned events and complete snapshots.
- Preparation: sanitized web247files changes only three chat/attendance modules; frontend remains byte-identical, private scan76files/8patterns/0matches. Worker unchanged.
- Handoff: finish final actual-model typo/alias/ambiguity/unrelated cases, deploy web and verify real alias/correction behavior before acceptance.
