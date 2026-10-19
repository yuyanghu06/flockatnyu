# Meeting-source instructions aligned

- Local timestamp / acting role / milestone: 2026-10-19T12:16:06.394173-04:00 / orchestrator / site-feedback.
- Requested scope: implement translated user-authorized product feedback.
- Starting state: frontend/browsers still under independent acceptance; audit release is separate.
- Work performed / changed files: Surgically changed two assistant-context prompt strings while preserving concurrent audit integration. Exact selected-channel summary syntax now explicit. Named-team schedules without selected source retain Calendar-first/Miro fallback; unresolved team details can use exact authorized team originals. Invalid summary arguments correct or use direct same-channel read, never claim absence from failure.
- Decisions: preserve all source/identity/leadership boundaries and existing defaults.
- Checks and evidence: Parent node --test tests/chat-agent-policy.test.mjs tests/miro-navigation.test.mjs tests/discord-agent-policy.test.mjs passes67/67. Behavioral model inference is not claimed by inert prompt/orchestration checks.
- Resulting state / acceptance: bounded implementation checks pass; final independent review/browser/live gate remains.
- Remaining work and handoff: parent integrates after independent acceptance and preserves concurrent releases. No private email/screenshots retained.
