# Contacts footer clipping scoped

- Local timestamp / acting role / milestone: 2026-10-27T11:02:39.669094-04:00 / orchestrator acting planner / contacts-footer-clipping.
- Requested scope: Move existing Cancel/Save buttons up so they stay inside the Contacts panel.
- Starting state: Prior native Contacts correction live and independently accepted; dirty working tree/concurrent daily-provider work preserved.
- Work performed / decisions: Inspected panel/body/detail/form CSS and footer markup. Actions follow a tall field grid with additional footer spacing; detail scroller can place them below the visible panel. Bound fix to src/contacts.css only; no taller dialog/data/behavior changes. Coder tests moving footer into visible scroller; root owns guides/journal/build/package/release.
- Acceptance: Existing dirty/create editor actions fully inside panel and hit-testable at desktop, short-height and mobile sizes; fields still scroll, save/cancel semantics unchanged, no business writes in checks. Independent tester/reviewer required before web-only release.
- Checks/evidence: Source read only; actual reproduction/fix/browser checks pending.
- Resulting state / remaining work: Implementation assigned to existing UI coder; source ownership exclusive.
