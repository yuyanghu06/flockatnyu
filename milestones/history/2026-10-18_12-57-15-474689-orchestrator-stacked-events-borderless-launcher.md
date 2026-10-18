# Restore clean stacked events and remove launcher border

- Local timestamp / acting role / milestone: 2026-10-18T12:57:15.474689-04:00 / direct implementation / rapid UI refinements.
- Requested scope: restore multiline event metadata with a cleaner appearance; remove launcher's white outer line.
- Starting repository state: earlier rapid UI refinements pending, including single-line metadata; preserved except requested corrections.
- Work performed / changed files: src/map-presence.js restores separate time/location elements inside a metadata group. src/map-presence.css uses consistent12px text and2px spacing; allows wrapping instead of single-line ellipsis. src/assistant.css removes launcher's white border. Source guide and journal updated.
- Decisions: keep title separated from grouped supporting metadata, keep location faithful, retain ivory/inset shadows and launcher motion. Supersedes earlier single-line event request; historical record preserved.
- Checks and evidence: npm run build passes with existing chunk advisory. Direct Chrome actual CSS checks at1280/390px verify separate metadata rows with2px gap and equal font sizes,0px launcher border and both inset shadows. No subagents used; no full-map rerun claimed.
- Resulting state / acceptance: stacked metadata restored with tighter grouping; white launcher border removed.
- Remaining work and handoff: continue user-led UI refinements; no backend/data/deployment changes.
