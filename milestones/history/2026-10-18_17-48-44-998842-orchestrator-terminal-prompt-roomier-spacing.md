# Roomier terminal prompt spacing

- Local timestamp / acting role / milestone: 2026-10-18T17:48:44.998842-04:00 / direct implementation / password UI.
- Requested scope: improve general placement and increase spacing across tilde/cursor/placeholder line.
- Starting repository state: local terminal/password UI refinements plus unrelated edits, preserved.
- Work performed / changed files: server/web.js removes negative prompt tracking, increases tilde-to-cursor gap.35em→.55em, sets cursor-to-placeholder gap.45em, and uses matching15ch+1.55em frame width. Clock-to-prompt gap16→20px. Existing palette/position/masking remain. Guides/tracking updated.
- Decisions: latest request to increase spacing supersedes earlier proposed overlapping placeholder/cursor treatment; no overlap implemented. Use em/ch sizing for consistent responsive gaps and stable mask width.
- Checks and evidence: refreshed Chrome preview and visually inspected expanded gaps/normal monospace spacing with clock/placeholder intact; scoped whitespace pass. Presentation-only adjustment, no extra behavioral tests; prior masked-entry and7auth checks remain previous-pass evidence.
- Resulting state / acceptance: roomier line spacing visible in Chrome; no auth/data/deployment/commit changes.
- Remaining work and handoff: user visual feedback.
