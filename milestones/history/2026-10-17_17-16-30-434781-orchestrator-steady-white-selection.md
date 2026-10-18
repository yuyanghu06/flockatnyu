# Steady white selection highlight

- Local timestamp / acting role / milestone: 2026-10-17T17:16:30.434781-04:00; orchestrator; M46 final white-highlight direction.
- Requested scope: revert outline; make the existing selection highlight smooth and clean white, preventing flicker.
- Starting state: partially implemented outline experiment and original colored/lifting surface effect.
- Work performed / changed files / decisions / checks: Final implementation is a constant white surface at opacity0.18. Removed hue/pulse and hover lift. Selected building takes priority over hover; hover-to-select on the same root preserves the exact overlay/fade, so camera movement and pointer leave cannot restart/drop it. At most two crossfading views borrow unchanged geometry/instance buffers. Two reusable materials are retained until controller disposal, avoiding repeated hover shader release/recompile. Original positions/materials/raycast/camera/avatar/loader behavior remain otherwise unchanged. Build/syntax/whitespace pass; focused Node tests26/26 pass, actual browser verification underway.
- Resulting state / acceptance: final white-highlight implementation ready; final browser evidence pending.
- Remaining work and handoff: bounded browser continuity/rehover check, review and integration.
