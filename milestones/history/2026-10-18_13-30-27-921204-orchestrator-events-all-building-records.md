# Dedicated events: events-all-building-records

- Local timestamp / acting role / milestone: 2026-10-18T13:30:27.921204-04:00 / orchestrator / events-relationships.
- Requested scope: implement normalized event relationships and all-linked-buildings map visibility.
- Starting repository state: concurrent UI/docs and event implementation edits preserved.

User superseded the club-event-only building card: all known current/future unexpired normalized record kinds now display, including presence and personal_plan. Stored titles, time windows and safe attendee portraits are reused; no event data is fabricated. Non-scheduled personal activities require at least one authorized trackable nondeclined participant with unexpired participation before showing title/portraits. Scheduled events may still have no attendees. Unknown/expired/cancelled/superseded windows omitted. Avatar eligibility, newest nonblank participation caption, privacy, time unions and simultaneous locations preserved. Coder22/22presence checks and independent tester25/25presence/source plus14/14actual SQL→API→Chrome checks pass. All tester resources closed; no cloud/data/model writes. New immutable type/icon work follows in same user task before normal-preview integration.

