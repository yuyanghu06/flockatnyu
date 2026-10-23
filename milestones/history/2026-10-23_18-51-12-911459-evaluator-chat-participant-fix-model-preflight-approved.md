# Corrected duplicate equality passes independent review

- Local timestamp / acting role / milestone: 2026-10-23_18-51-12-911459 / coder correction and independent evaluator / chat-map-participants.
- Work performed: comparison now retains completed facts before the existing direct-chat source URL rewrite, while actual attribution remains unchanged. Native/legacy recovery regression includes differing-label and differing-link duplicates.
- Checks and evidence: coder ran 34 recovery/time/participant cases, API build and whitespace checks successfully. Evaluator independently ran node --test tests/chat-map-participants.test.mjs tests/chat-map-recovery.test.mjs: 24 pass, no remaining material issue. Initial failures remain recorded; two fixture corrections do not weaken the substantive provenance assertion.
- Decisions: preflight approves at most 10 actual configured-model requests, 5 per case, using production chat runner/adapters, synthetic storage, inference-only networking and frozen source pins. Two cases exercise saved-caption attendance changes and repeated same-person addition. Component checks, not model choices alone, establish omitted-label and duplicate-row handling.
- Resulting state / acceptance: implementation and model preflight approved; actual-model gate and final evaluation pending. No live business writes or deployment.
- Remaining work: tester confirms green independent checks and freezes source, runs the capped gate with final-answer/exact-field checks, then final read-only evaluation.
