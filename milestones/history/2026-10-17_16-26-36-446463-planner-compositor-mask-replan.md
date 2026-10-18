# Compositor mask correction plan

- Local timestamp / acting role / milestone: 2026-10-17_16-26-36-446463 America/New_York; planner; M43.
- Requested scope: user-directed favicon and smooth loading refinements.
- Starting state: M41 native contour loader; broad unrelated working tree preserved.
- Work performed / decisions / checks / resulting state: Read-only planner recommends two fixed alpha SVG masks with static conic-gradient child surfaces animated only by compositor transforms, same2.133333s period; opposing rotations with reversed inner palette. Bounded mask warmup500ms plus2paint opportunities capped150ms. Preserve silhouette and1100/1000exit. Static masks can affect compositing, so actual blocked-load pixels decide acceptance.
- Remaining work and handoff: final independent visual checks and evaluation before acceptance.
