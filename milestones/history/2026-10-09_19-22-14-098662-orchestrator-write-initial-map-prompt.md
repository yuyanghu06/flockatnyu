# Write initial map prompt with additional GLB extraction

- Local timestamp / acting role / milestone: 2026-10-09T19:22:14.098662-04:00 / orchestrator / M1 handoff.
- Requested scope: User cancelled implementation and requested a Markdown prompt for another assistant. Latest steering adds extraction of the missing center from /Users/yuyang/Downloads/scene.glb.
- Starting repository state: Initial read-only planning and startup journal, no application implementation. Planner wrap-up recorded in 2026-10-09_19-22-14-097821-planner-partial-campus-inspection.md.
- Work performed / changed files: Created docs/initial-map-prompt.md; updated docs/root guides, README, milestone snapshot, to-do and M1 scope. No app files created, no extraction performed, no source-site/MCP/global settings changed.
- Decisions: Preserve original GLB. Prompt covers local Washington Square view, free orbit/pan/zoom, reset, camera JSON copy/fallback and restore, asset placement/attribution, and verified extraction/alignment. Spoken “Halcyon” may refer to John A. Paulson Center; asked clarification and recorded unresolved identity in prompt rather than asserting it.
- Checks and evidence: Input exists, 389,960 bytes, GLB v2, 151 nodes/150 meshes/50 materials, sampled node names blank, no required extensions. Header inspection only, no geometry identification claimed. Document/link/content checks recorded below. Chrome launched successfully using temporary Playwright outside project; no map/browser behavior was exercised.
- Resulting state / acceptance: Requested prompt delivered; M1 implementation deferred to receiving assistant. No application, dev server, build or extraction exists.
- Remaining work and handoff: Confirm center identity; receiving assistant follows prompt and implements. Native named role discovery remains the earlier runtime follow-up.
