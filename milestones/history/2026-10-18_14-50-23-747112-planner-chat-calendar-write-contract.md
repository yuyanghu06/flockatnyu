# Request-scoped Calendar write contract planned

- Local timestamp / acting role / milestone: 2026-10-18_14-50-23-747112 / planner / Chat Calendar writes and Drive search
- Requested scope: User authorized chat Calendar writing and Drive search.
- Starting repository state: Extensive concurrent prompt/map/Miro work; preserved.
- Work, decisions and verification: Read-only planner30existing Calendar/Google checks pass. Existing chat deliberately exposes reads only. Add separate fixed-calendar user-directed create/edit/soft-cancel methods with current-turn affirmative intent, request-local observed event revisions, changed-fields-only patches and optimistic If-Match. Preserve autonomous Miro provenance/fingerprints and unsupported attendee/recurrence boundaries. Stateless tool route grants no user action. Drive search/read already wired; no new Drive capability code needed. Root actual protected Drive search returns ready with2files and partial warning. Coder owns chat adapter/intent/client; root owns minimal index/context integration and docs; independent tester owns new tests. No source writes or configuration changes.
- Handoff: Rolling snapshot contains actual next action; no worker activation or deployment implied.
