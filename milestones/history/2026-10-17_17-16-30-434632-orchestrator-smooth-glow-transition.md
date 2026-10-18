# Smooth highlight transition implementation

- Local timestamp / acting role / milestone: 2026-10-17T17:16:30.434632-04:00; orchestrator; M46 final white-highlight direction.
- Requested scope: revert outline; make the existing selection highlight smooth and clean white, preventing flicker.
- Starting state: partially implemented outline experiment and original colored/lifting surface effect.
- Work performed / changed files / decisions / checks: Added350ms fade-in and280ms fade-out using smoothstep, retaining an outgoing surface view during crossfade and continuing reversal from current strength. Initial legacy-colored/lift behavior was then superseded by the user’s clearer request: selection flickers and should be a clean white highlight.
- Resulting state / acceptance: final white-highlight implementation ready; final browser evidence pending.
- Remaining work and handoff: bounded browser continuity/rehover check, review and integration.
