# Contacts avatar corrected to rounded square

- Local timestamp / acting role / milestone: 2026-10-26T13:21:40.731283-04:00 / coder / contacts-ui.
- Requested scope: User removed the surrounding circle and requested a square button with circular boundaries, interpreted as rounded corners.
- Starting repository state: Icon-only circular avatar/ring implementation;15supplemental browser/motion checks passed for that now-superseded appearance.
- Work performed / changed files: Removed the circular ring from both CSS SVG masks; kept only head/shoulders. Changed outer46pxdesktop/44pxmobile surface to a rounded square with16px corners. Exact pastel hover/focus motion and reduced-motion fallback preserved. Root aligned style/source guides.
- Checks and evidence: Frontend build/syntax/whitespace pass. Prior circle test evidence preserved as superseded; final rounded-square retest underway.
- Resulting state / acceptance: Newest user-selected shape implemented and frozen for final browser review.
- Remaining work: Verify final shape/animation/completeflow, inspect refreshed preview, finish journal. No real contacts/modelcalls/deployment.
