# Center Scheduled events heading

- Local timestamp / acting role / milestone: 2026-10-18T12:46:13.833539-04:00 / direct implementation / rapid UI refinements.
- Requested scope: center the Scheduled events heading in its building activity panel.
- Starting repository state: clean working tree; heading left aligned.
- Work performed / changed files: src/map-presence.css centers the building-card h3; src/info.md documents alignment. Shared snapshot and to-do updated.
- Decisions: retain existing heading sizing and spacing. Work performed directly, without subagents, as requested.
- Checks and evidence: npm run build passed (existing chunk-size advisory); headless Chrome checks actual stylesheet at desktop/mobile widths for centered text.
- Resulting state / acceptance: requested heading alignment implemented locally.
- Remaining work and handoff: continue with the user's next UI change; no deployment or data changes.
