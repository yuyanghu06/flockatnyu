# Steady white highlight accepted

- Local timestamp / acting role / milestone: 2026-10-17T17:17:28.298995-04:00; evaluator; M46.
- Requested scope: smooth clean white highlight, fixing selection flicker after cancelling outline.
- Starting state: steady-white implementation ready for focused verification.
- Work performed / changed files / decisions / checks: Independent read-only evaluator ACCEPT M46 final direction. White opacity0.18 remains constant;350ms entrance/280ms exit preserve continuity and rehover strength. Selecting the hovered root keeps the same overlay and selection survives pointer leave. No hue/pulse/lift or canceled outline/pin remains. Shared geometry and bounded two-material reuse verified; no material findings. One desktop landmark browser scope does not establish broad GPU/device behavior.
- Resulting state / acceptance: completed locally with independent acceptance.
- Remaining work and handoff: user visual feedback; broader device performance unmeasured.
