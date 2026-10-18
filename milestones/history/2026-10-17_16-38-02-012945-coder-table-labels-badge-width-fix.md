# Table labels badge width fix

- Local timestamp / acting role / milestone: 2026-10-17T16:38:02.012945-04:00; coder; map-presence-labels.
- Requested scope: prevent neighboring long label overlap.
- Starting state: broad label width could extendinto adjacent markers.
- Work performed: only map-presence.css changed; capped border-boxbadges50pxdesktop/40pxmobile below58/48pxspacing. Fulltextremains in title/detail.
- Checks/evidence: frontendbuild andscopedwhitespace PASS; no mapgeometry/portrait changes.
- Resulting state: focusedfix ready; independent latestCSS verification required.
- Handoff: tester verifiesfive200Unicode labels separation.
