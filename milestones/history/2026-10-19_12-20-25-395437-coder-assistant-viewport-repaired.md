# Viewport shrink repaired

- Local timestamp / acting role / milestone: 2026-10-19T12:20:25.395437-04:00 / coder / site-feedback.
- Requested scope: implement translated website feedback with existing source/privacy boundaries.
- Starting state: frontend/backend initial implementation under independent review; live audit37bec69is separate.
- Work performed / changed files / checks: Independent real viewport shrink exposed stale inline minimum height overriding dvh max. Viewport-capped minimum, resize/visualViewport listeners and animation cancellation now keep footer visible through tall-to300/480pixelheightchanges. Node16/frontendbuild/uploads pass; no private references retained.
- Decisions: preserve source/identity/Calendar/Miro-read-only policies and loading animation. No raw private correspondence or reference screenshots in repository.
- Resulting state / acceptance: bounded pass complete with stated limitations; production feedback release not yet claimed.
- Remaining work and handoff: parent serializes final review, package isolation and protected-web hosted verification.
