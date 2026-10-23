# Chat map name clarification implemented locally

- Local timestamp / acting role / milestone: 2026-10-22T15:33:46.682929-04:00 / independent coder, serialized by orchestrator / chat-map-clarification.
- Requested scope: Shared web/Discord prompts ask missing person name and withhold updates when essential facts are insufficient; remove source-link demand merely to identify speaker.
- Starting state: Accepted read-only prompt brief and expanded routing plan; actual direct-save versus worker-handoff choice pending. Concurrent pipeline and receipt edits preserved.
- Work performed / changed files: Coder edited only server/chat-behavior.js, relevant identity prose in server/assistant-context.js and matching docs/chat-agent-prompt.md paragraphs. Shared behavior reuses clear stated names/verified Discord speaker context, carries activity/place/time through name-only reply and requires actual saved receipts.
- Decisions: Existing source-backed backend mechanics remain unchanged and truthful; prompt-only edits do not enable a new persistence route. No original source link requested solely to identify the speaker.
- Checks and evidence: Coder syntax/whitespace pass, 51 focused policy/context/request-context/size tests passed; attendance suite 8 pass/1 obsolete assertion failure at tests/chat-attendance-orchestration.test.mjs:98 expecting removed source-link wording. Independent tester assigned that expectation and focused verification. No live model/source calls, deployment or commits.
- Resulting state / acceptance: Local implementation inspected; independent test/review pending. Actual write route and source-gate replacement remain unresolved, not claimed complete.
- Remaining work and handoff: Update stale test expectation without weakening its original evidence-boundary purpose, independently review, update folder guides and finish selected backend route after user answer.
