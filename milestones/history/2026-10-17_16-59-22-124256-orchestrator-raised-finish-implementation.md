# Raised finish implementation

- Local timestamp / acting role / milestone: 2026-10-17T16:59:22.124256-04:00; orchestrator; M45.
- Requested scope: slightly raised existing pastel @ and matching restored-size favicon.
- Starting state: v5 full-pastel runtime restored after rejected v6; smaller favicon present.
- Work performed / changed files / decisions / checks: Added scripts/build-brand-relief.mjs and static relief SVG plus loop-only preview. index.html adds one optional positioned image after the color layers; image errors hide only itself. Initial clip referenced a group, so interior sheen/bevel did not render in Chrome; tester identified zero changed interior pixels. Fixed by placing direct outline paths and their transform in clipPath. Regenerated overlay. User approved the corrected appearance twice. No shape, palette, motion or lifecycle changes.
- Resulting state / acceptance: raised direction approved by user; final technical checks underway.
- Remaining work and handoff: independent icon and final evidence review, then integrate.
