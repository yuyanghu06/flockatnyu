# User timezone scanning integrated

- Local timestamp / acting role / milestone: 2026-10-15_21-15-58-242137; orchestrator; M32.
- Requested scope: date-based scans use the user timezone.
- Starting repository state: shared dirty workspace with M29–M31 preserved; M32 implementation and independent evidence complete.
- Work performed / changed files: Integrated per-send browser timezone, validated request context and one server clock; strict calendar normalization for Discord search and reads; shared RAM-window behavior; local-time prompts and effective timezone/UTC coverage. Updated date and folder guides, preserved prior dirty work, refreshed the existing paired local runtime. Final root integrated suite134/134 passes, independent tester95/95 plusChrome4/4 pass, independent evaluator ACCEPT. API/frontend builds and git diff --check pass. No database, scheduler or cloud changes, no real model calls.
- Decisions: browser timezone sampled on every send; missing legacy context explicitly UTC. Calendar dates use first valid local-day start and exclusive next-day end, preserving DST. Explicit offset instants remain unchanged. Source authorization is separate.
- Checks and evidence: evidence/m32-user-time-zone/tester-report.md, local-tests.log, local-browser-results.json, integrated-tests.log and local-runtime-smoke.json. Invalid inputs are rejected before bot/model dispatch.
- Resulting state / acceptance: M32 accepted and complete for local request behavior. No schema or scheduler change; no commit, push or hosted deployment.
- Remaining work and handoff: no required M32 work remains. Actual browser OS travel is emulated, broader natural-language dates remain model interpreted, and Google raw query rewriting is outside this bounded Discord change. Existing pending Google consent, Miro token/scope and natural metadata cron observation remain in the to-do list.
