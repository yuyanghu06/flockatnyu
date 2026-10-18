# Password cursor on/off blink

- Local timestamp / acting role / milestone: 2026-10-18T17:34:28.446218-04:00 / direct implementation / password UI.
- Requested scope: blink without fading.
- Starting repository state: pending local password UI refinements.
- Work performed / changed files: server/web.js switches cursor animation to1.1s steps(1,end) with binary opacity1/0. Existing rounded gray appearance, position, placeholder and reduced-motion steady state preserved. Updated guides and tracking.
- Decisions: instantaneous visibility changes, no opacity interpolation.
- Checks and evidence: inspected CSS stepped animation and keyframes; Chrome preview refreshed and Password remains focused. Scoped whitespace passes. No behavioral tests added for presentation-only timing change.
- Resulting state / acceptance: requested on/off blink implemented locally.
- Remaining work and handoff: further user visual pass; no auth changes/deployment/commit.
