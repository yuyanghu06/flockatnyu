# Contacts refresh preservation verified

- Timestamp / role / milestone: 2026-10-27T12:10:24.955129-04:00 / tester / contacts-flock-context.
- Scope: Separate Notes scrolling and action footer; Flock it! names-only subject chip; directory Refresh left of Add.
- Work, checks and decisions: Independent desktop and320px browser checks verify updated row appearance, exact query/filter/sort/offset preservation, no selected-detail re-read, dirty Notes/highlight and saved-only Flock/reopen preservation, and zero refresh mutations. Pending read/save disable the button. Focused500px Notes at320px remains separately clipped above footer with reachable resize handle. No additional inference or business calls.
- Evidence: Private ignored evidence/contacts-footer-layout/. API/frontend builds and whitespace pass; existing large bundle warning remains. Actual inference was limited to the configured endpoint on simulated persistence; no live business writes.
- Result and handoff: Local implementation and review complete. Root releases only the existing website service and verifies fresh-page behavior while preserving the actual user tab and draft.
