# Static failed and terminal tool statuses

- Local timestamp / acting role / milestone: 2026-10-18T13:53:18.830706-04:00 / direct implementation / rapid UI refinements.
- Requested scope: Failed must not shimmer.
- Starting repository state: Done/Partial result static; other tool statuses still animated.
- Work performed / changed files: src/assistant.css limits shimmer to running tools and Thinking. Updated browser expectations for failed tool results; source guide/journal refreshed.
- Decisions: terminal states (Done, Partial result, Failed, Stopped, Interrupted) stay static; active work alone shimmers. Reduced motion remains static for every state.
- Checks and evidence: npm run build passes; direct Chrome computed-animation checks verify running/Thinking animate, five terminal states do not, and reduced motion disables all.
- Resulting state / acceptance: Failed is static; directly verified without subagents.
- Remaining work and handoff: next UI request; no backend/data/deployment changes.
