# Contacts header refresh implemented

- Timestamp / role / milestone: 2026-10-27T12:10:24.954977-04:00 / coder / contacts-flock-context.
- Scope: Separate Notes scrolling and action footer; Flock it! names-only subject chip; directory Refresh left of Add.
- Work, checks and decisions: Added accessible Refresh contacts icon immediately left of Add contact. Reads directory page0 with current query/filters/sort; preserves selected details and unsaved Notes, disables during list loading or save. Mobile header wraps without hiding Add label or overflowing. Only Contacts JS/CSS changed; final pins d4684b6f/4a34d8c.
- Evidence: Private ignored evidence/contacts-footer-layout/. API/frontend builds and whitespace pass; existing large bundle warning remains. Actual inference was limited to the configured endpoint on simulated persistence; no live business writes.
- Result and handoff: Local implementation and review complete. Root releases only the existing website service and verifies fresh-page behavior while preserving the actual user tab and draft.
