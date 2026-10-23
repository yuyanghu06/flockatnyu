# Chrome Flock behavior test plan

- Local timestamp / acting role / milestone: 2026-10-22T18:57:29.116567-04:00 / independent planner / live-planner-calendar-tests.
- Requested scope: review actual Discord conversations, create disposable synthetic tests, verify Calendar/map changes, record behavior failures.
- Starting state: extensive pre-existing working-tree changes preserved. Worker b30c41da deployed; older manual runs remain active/queued.
- Work performed: read-only project/runtime/evidence review; parent owns all Chrome actions and evidence. No application changes or external actions by planner.
- Decisions: separate mentioned chat requests from plain planner announcements; create/edit/cancel the same native original to test stable identity. Verify timed club Calendar, Member Plans personal plan, duplicate prevention, undecided event date, location correction and exact cancellation. Use exact test-channel whitelist, normal leases, no source-history import or unrelated writes.
- Checks and evidence: planner inspected instructions, latest milestone/release history, automation/Calendar/map code, existing ignored case matrix and harness. Plan accepted for execution; no new behavior pass claimed. Historical latency about9.5minutes per cycle and malformed-argument/deadline risks remain open.
- Resulting state / acceptance: planning complete; Chrome review underway. Supabase MCP unavailable; parent disclosed using application map API and Calendar API without direct database operations.
- Remaining work: complete synthetic tests and distinguish current reproduced failures from historical ones, record exact native messages/provider IDs privately, evaluate evidence independently and journal results.
