# Building view and screen wheel contract

- Local timestamp / acting role / milestone: 2026-10-11T17:01:25.430342-04:00 / planner / M19 building views.
- Requested scope: seven user screenshot views with lowered camera height and focused outward scrolling anywhere.
- Starting state: per-building front vectors with common 65-degree polar; canvas-only wheel return; existing backend work preserved.
- Work performed: independent read-only planner inspected map modules, model coordinates, screenshots, existing evidence and loading/assistant interfaces.
- Decisions: screenshots give approximate azimuth and original polar; map Y-up height is interpreted from user Z-down wording. Stern height factor .75, six others .8. Relative Y lowering retains horizontal offset; exact screenshot camera JSON unavailable.
- Checks and evidence: source/screenshot inspection only, no runtime tests.
- Acceptance: brief ready for implementation and browser refinement.
- Handoff: per-building profile, common wheel gesture ownership, loading gate, no overlay raycasts and independent browser checks.
