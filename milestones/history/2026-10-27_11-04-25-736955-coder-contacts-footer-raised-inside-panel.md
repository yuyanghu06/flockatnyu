# Contacts footer raised inside panel

- Timestamp / role / milestone: 2026-10-27T11:04:25.736955-04:00 / coder / contacts-footer-clipping.
- Scope and changes: src/contacts.css only; editor footer adds sticky bottom0 positioning and opaque panel background. No JS/dialog-height/data change.
- Evidence: Actual Chrome before/after6viewports shows both actions initially clipped/unhittable before and fully contained/hit-testable after, including after scrolling. Normal-flow footer space permits full104pxNotes above actions at scroll bottom. Screenshots inspected; CSS pin83148b30fdb7626c011bc722fae960dc019d3a29f4088cecef5de8edc78c2338. Ignored evidence/contacts-footer-clipping/.
- Checks: Browser PASS, root frontend build/whitespace PASS (existing bundle warning). Independent tester/evaluator pending. No live/business writes.
- Handoff: Independent behavior/review, frontend-only package and live verification.
