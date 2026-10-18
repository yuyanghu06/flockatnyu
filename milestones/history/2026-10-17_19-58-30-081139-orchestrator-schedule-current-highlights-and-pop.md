# Schedule current locations, highlights and pop animation

- Local timestamp / acting role / milestone: 2026-10-17T19:58:30.081139-04:00 / primary orchestrator, direct implementation per user / avatar redesign.
- Requested scope: rename Schedule; include current location; restore previous row alignment; combine subtitles on one line; highlight active date/time windows; pop in whole panel; remove orange outline and darken fill.
- Starting repository state: extensive unrelated tracked/untracked work, preserved; previous portrait pass complete; current Schedule/layout/highlight work pending journal.
- Work performed / changed files: src/map-presence.js and CSS; corresponding source/map/asset guides; avatar milestone and rolling journal. Current location first, active/future plans after it. Single-line subtitles retain full text via title. Darker #ffdc5a66 fill replaces faint yellow and orange outline. Panel opens with a 380ms scale/opacity bounce on reveal or person change only; reduced motion disables animation.
- Decisions: use validity timestamps for timed highlights and New York midnight windows for date-only plans. Preserve outer translateY positioning while animating independent scale. No database, asset, API, deployment or credential changes in this pass.
- Checks and evidence: node --check src/map-presence.js passed; npm run build passed (295ms), log /tmp/techvisualized-schedule-final-build.log. Source inspection confirms reveal/person identity is separate from cached content refresh. Earlier pending layout build also passed (520ms).
- Resulting state / acceptance: implemented locally. No independent specialist or browser visual testing, per user-led rapid iteration preference.
- Remaining work and handoff: user will test visual spacing, animation and highlight appearance; retain other milestone tasks, including concurrent selection-indicator work.
