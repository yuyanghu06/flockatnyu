# Distinct duplicate source links must remain conflicting

- Local timestamp / acting role / milestone: 2026-10-23_18-50-05-285965 / independent tester and evaluator / chat-map-participants.
- Requested scope: independently validate label preservation and harmless duplicate removal.
- Work performed: initial new component matrix ran 9 cases; 6 pass and 3 fail. Tester and read-only evaluator independently reproduced a real issue: the existing direct-chat attribution step rewrites source_url before equality comparison, making two different explicit duplicate links appear identical and allowing a save.
- Decisions: require comparison after omitted provenance completion but before this lossy rewrite. Keep existing attribution policy unchanged; exact differing supplied strings must reject. Two other failures are corrected test setup/oracles: include required notes on new-event arguments and compare relationship facts by identity rather than replacement-array order. The substantive URL conflict test remains unchanged.
- Checks and evidence: independent in-memory production-adapter runs only. Optional root worker-contract run has 11 pass / 5 fail identically on unmodified HEAD 0cd0b359 and current checkout; old worker expectations are unrelated to chat changes and are not claimed fixed. Private baseline log is evidence/chat-map-participants/baseline-worker-contracts.txt.
- Resulting state / acceptance: request fixes; no inference or deployment until corrected component checks and review pass.
- Remaining work: coder narrow comparison correction, independent retest, capped actual-model gate, release review.
