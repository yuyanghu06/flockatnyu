# Chat participant normalization contract

- Local timestamp / acting role / milestone: 2026-10-23_18-45-50-082551 / planner (independent read-only) / chat-map-participants.
- Requested scope: fill omitted participant labels from the same authorized event read, otherwise empty string; discard duplicate participants only when they add no different facts.
- Starting state: d90f9d5 contains accepted chat time/target/recovery work. Unrelated planner and documentation changes remain in the shared checkout. The prior web release is being verified separately.
- Work performed: inspected chat schema, map validation, time normalization and recovery tests. No implementation, inference or live operations in this pass.
- Decisions: relax only chat label requirement; preserve explicit empty labels and reject invalid nulls; compare completed participant facts conservatively; keep differing duplicate rejection and strict optimistic versions. Use distinct canonical participant IDs in new-event identity. Duplicate buildings and shared worker contracts remain unchanged. No hidden reads or service combinations.
- Checks and evidence: read-only specialist report; code and tests remain pending. Coder owns narrow adapter/helper/recovery-test changes; tester owns new independent behavior/model harness files; orchestrator owns journals.
- Resulting state / acceptance: bounded implementation contract accepted, implementation and independent verification pending.
- Remaining work: implement, run meaningful adapter/runner cases and bounded configured-model scenarios on simulated storage, independent review, integrate under existing release authorization.
