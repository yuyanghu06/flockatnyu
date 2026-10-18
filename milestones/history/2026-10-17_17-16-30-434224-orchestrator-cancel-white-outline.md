# White outline cancelled

- Local timestamp / acting role / milestone: 2026-10-17T17:16:30.434224-04:00; orchestrator; M46 final white-highlight direction.
- Requested scope: revert outline; make the existing selection highlight smooth and clean white, preventing flicker.
- Starting state: partially implemented outline experiment and original colored/lifting surface effect.
- Work performed / changed files / decisions / checks: User requested reverting the in-progress Cities: Skylines perimeter, then clarified the existing highlight should apply more smoothly. Stopped coder/tester. Removed src/landmark-outline.js and the extra main-loop outline hook; restored prior source-based surface views. The floating pin remained cancelled. Partial outline code was not accepted or browser-validated; other map/avatar/branding/backend edits preserved.
- Resulting state / acceptance: final white-highlight implementation ready; final browser evidence pending.
- Remaining work and handoff: bounded browser continuity/rehover check, review and integration.
