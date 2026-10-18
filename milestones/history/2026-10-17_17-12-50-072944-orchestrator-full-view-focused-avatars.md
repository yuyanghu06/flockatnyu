# Full-view focused avatars

- Local timestamp / acting role / milestone: 2026-10-17T17:12:50.072944-04:00 / orchestrator direct / avatar-redesign.
- Requested scope: focused avatars enlarge freely beyond building boundaries and combine to occupy the entire screen space.
- Starting repository state: focused 1.6× preference still reduced by building silhouette fitting; user explicitly superseded this constraint.
- Work performed / changed files: src/map-presence-layout.js adds viewport-sized largest equal-circle grid with centered incomplete rows; src/map-presence.js bypasses silhouette sampling/fitting while focused, hides other building groups, preserves pixel positions/diameters across coordinate-frame changes and eases expansion/return. Current source/map guides updated.
- Decisions: overview retains silhouette fitting/world-relative zoom size. Focus uses full map viewport and stable screen-relative positions independent of camera rotation; no building boundary constraint. Existing 4.5/s easing, edge shading, circle shapes and pop lifecycle remain.
- Checks and evidence: node --check on both modules and npm run build PASS (existing chunk warning). Direct layout check PASS for 1/2/5/26 portraits at 1440x900 and 390x844: positive size, viewport containment and no circle overlap. Browser appearance is for user review; no specialists.
- Resulting state / acceptance: implemented locally; 1.6× constrained focus design superseded. No source assets, URLs, API/data/deployment changes.
- Remaining work and handoff: user checks full-view size, focus/overview transitions and desired arrangement.
