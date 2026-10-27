# Contacts selection and idle animation fixed

- Local timestamp / acting role / milestone: 2026-10-27T10:49:03.513138-04:00 / coder / treg-contact-diagnosis.
- Requested scope / starting state: UI coder exclusively changed src/contacts.js and src/contacts.css. Existing dirty worktree preserved.
- Work performed / changed files / decisions: Requested contact ID now stays highlighted through loading/failure/retry and stale reads. Launcher uses focus-visible so pointer-restored focus does not continue spinning.
- Checks and evidence: Actual installed Chrome with synthetic read-only client: nine behavior checks PASS, zero page errors; syntax and whitespace pass. Ignored evidence/treg-contact-diagnosis/ui/report.json and selection.png.
- Resulting state / acceptance / remaining work: Locally verified; independent final review/release remains.
