# Remove redundant mock Edit control

- Local timestamp / acting role / milestone: 2026-10-26T15:31:24.184652-04:00 / planner / contacts-design-mock.
- Requested scope: Remove the pictured Edit button.
- Starting repository state: All six mock fields are already directly editable.
- Work performed / changed files: Read-only plan accepted: remove button construction/append, unused beginEdit and scoped Edit CSS from two mock files.
- Decisions: Preserve red × confirmation, direct fields, dirty Save/Cancel, identity/header layout and Load more's independent raised gray styles.
- Checks and evidence: Source-based plan only; focused desktop smoke and screenshot follow implementation. No broad test/build rerun needed.
- Resulting state / acceptance: Coder owns mock JS/CSS; tester owns ignored desktop evidence.
- Remaining work and handoff: Implement, verify and evaluate; no production files or service changes.
