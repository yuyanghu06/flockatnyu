# Remove assistant white outer border

- Local timestamp / acting role / milestone: 2026-10-18T12:56:19.846775-04:00 / direct implementation / rapid UI refinements.
- Requested scope: remove the visible white outline at the assistant dialog's outer edge.
- Starting repository state: prior rapid UI edits pending and preserved.
- Work performed / changed files: src/assistant.css changes dialog border from1px white to0; journal/source guide refreshed.
- Decisions: retain avatar-matched ivory, inset shading and opening motion.
- Checks and evidence: production build passed with existing chunk-size advisory; direct Chrome computed-style check verifies0px border and both inset shadows retained. No subagents.
- Resulting state / acceptance: white outer border removed locally.
- Remaining work and handoff: next user UI request; no deployment/data changes.
