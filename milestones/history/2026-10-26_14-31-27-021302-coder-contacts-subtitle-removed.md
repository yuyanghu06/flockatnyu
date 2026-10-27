# Contacts subtitle removed

- Local timestamp / acting role / milestone: 2026-10-26T14:31:27.021302-04:00 / coder / contacts-ui.
- Requested scope: Remove subtitle beneath Contacts.
- Starting repository state: Completed local Contacts UI/API and style guide, unrelated work preserved.
- Work performed / changed files: Removed the Contacts subtitle paragraph and its3unused desktop/mobile/narrow CSS rules; title/Add contact/close retained. Updated src/info.md. Parent added title-only header rule to docs/style-design.md.
- Checks and evidence: node --check, git diff --check and frontend build pass; existing chunk-size warning unchanged. No new tests for this reversible text/style removal.
- Resulting state / acceptance: Requested change accepted.
- Remaining work and handoff: None for this correction; production release remains separate.
