# Map presence wrapped layout finding

- Local timestamp / acting role / milestone: 2026-10-17T16:20:15.743063-04:00; evaluator; map-presence-ui.
- Requested scope: review viewport-safe five-avatar layout.
- Starting state: desktop and normal mobile fixture visible; source code wraps on very narrow widths.
- Work performed: primary inspected projected layout arithmetic; independent reviewer confirmed adjacent-row fan curvature can cause overlap at240/250px viewport widths. No edits/cloud operations.
- Decisions:280px still fits five columns because formula includes+1; actual wrap case must use240/250px. Require pairwise distance, not just viewport bounds.
- Checks and evidence: four-column row centers can approach37.26px with40px circles; focused frontend fix requested. Initial HMR and floating-pixel test artifacts are separate harness issues, not this geometry finding.
- Resulting state / acceptance: material narrow-layout finding pending fix and independent browser verification.
- Remaining work and handoff: reserve fan curvature in row pitch, rebuild and verify actual wrapped widths.
