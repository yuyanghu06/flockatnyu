# Raised favicon at original size

- Local timestamp / acting role / milestone: 2026-10-17T16:59:22.124379-04:00; orchestrator; M45.
- Requested scope: slightly raised existing pastel @ and matching restored-size favicon.
- Starting state: v5 full-pastel runtime restored after rejected v6; smaller favicon present.
- Work performed / changed files / decisions / checks: User asked to match the approved raised appearance and restore original icon size. Favicon builder changes mark scale0.65 to1, embeds the exact static relief with prefixed IDs and fragment references, and preserves rounded white badge. Regenerated self-contained SVG and16/32/48ICO; noPNGfavicon. Three entry pages use raised-at query. Fresh frontend build and scoped checks pass; focused final icon verification remains pending.
- Resulting state / acceptance: raised direction approved by user; final technical checks underway.
- Remaining work and handoff: independent icon and final evidence review, then integrate.
