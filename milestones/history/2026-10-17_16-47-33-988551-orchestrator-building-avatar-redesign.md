# Building avatar redesign

- Local timestamp / acting role / milestone: 2026-10-17T16:47:33.988551-04:00 / orchestrator acting directly / avatar-redesign.
- Requested scope: user leads rapid visual changes and performs browser testing; no delegation. Borderless circular avatars throughout buildings, zoom-relative size, no on-map label, individual scale-only bubble entrance.
- Starting repository state: extensive existing dirty worktree; current avatar overlay was an above-roof fan with circles, tethers and labels. No speculative card redesign was applied.
- Work performed / changed files: src/map-presence.js/.css; src/info.md; docs/map-presence.md; milestone snapshot/checklist and avatar-redesign guide. Cached footprint raycasts and vertically distributed building-local anchors, world-size projection, removed tethers/dots/badges, staggered in-place scale bounce after startup, no poll replay, reduced-motion handling.
- Decisions: portraits remain circular per latest correction. Position/scale follows the building and camera; no continuous drifting animation. Stored activity remains in accessible names and details. API/schema/source policy unchanged.
- Checks and evidence: node --check src/map-presence.js PASS; npm run build PASS (existing large-chunk warning). Final CSS refinement checked by a subsequent build in the same pass. No browser test or independent specialist run at user's request.
- Resulting state / acceptance: implemented locally for user visual testing. Existing roof-fan browser assertions are superseded; mesh depth occlusion is not implemented for DOM avatars.
- Remaining work and handoff: user tests appearance/positions/zoom/pop and directs next changes. No deployment, database changes, commit or push.
