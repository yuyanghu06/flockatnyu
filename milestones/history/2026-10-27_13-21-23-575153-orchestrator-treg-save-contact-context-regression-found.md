# treg save contact context regression found

- Timestamp / acting role / milestone: 2026-10-27T13:21:23.575153-04:00 / orchestrator / treg-default-save.
- Scope and starting state: Approved separate native Contacts import and prompt-led lookup/save workflow; unrelated current Gmail send and other work preserved.
- Work and checks: Root27existing Treg/Contacts/native-field checks passed. Additional Gmail-send/selected-contact check passed7of8: unconditional registry injection made the contact-only request context uncloneable in an existing real-runner instrumentation wrapper, preventing completion. Requested coder restrict bridge injection to conversations with Treg adapters; tester pauses actual-model after in-flight call and retains all inference spent. No release; prepared context is provisional. Prior6newdeterministic/scripted scenarios passed, not substitute for final model evidence.
- Result / acceptance: Implementation review is provisional; all material regressions require fixes before release.
- Remaining work / handoff: Focused fix/retest, frozen actual-model evaluation, independent acceptance and isolated website release. No paid Treg or live Contacts test writes.
