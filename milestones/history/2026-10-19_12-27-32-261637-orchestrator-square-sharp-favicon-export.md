# Square sharper favicon export

- Local timestamp / acting role / milestone: 2026-10-19T12:27:32.261637-04:00 / orchestrator / Downloads export revision.
- Requested scope: make the export fully square and reduce blur.
- Starting repository state: previous Downloads PNG retained the SVG's rounded badge and soft raised edges; unrelated user changes preserved.
- Work performed / changed files: removed badge rounding in memory, set native SVG dimensions to 1080, tightened bevel/shadow blur, rendered at 4× scale with Chrome/Playwright, and downsampled with Lanczos and light sharpening. Replaced /Users/yuyang/Downloads/Flock-NYU-favicon-1080.png and added Flock-NYU-favicon-square-4320.png in the same folder. Application/source assets unchanged.
- Decisions: preserve pastel gradient and raised appearance; fully opaque white square background.
- Checks and evidence: ImageMagick confirms 1080 × 1080 and 4320 × 4320 exports; corner samples white; direct visual inspection confirms square background and crisp mark contours. Verification performed by orchestrator.
- Resulting state / acceptance: revised export and larger master saved successfully.
- Remaining work and handoff: no remaining export work; existing development follow-ups preserved.
