# Normalized events independent evidence

This folder records the independent tester's synthetic SQL-to-browser acceptance
for the events, event_buildings and event_people cutover. Reproduce with
`node tests/events-browser.mjs` from the project root. It creates an in-memory
PGlite database, applies real migrations001–028, starts isolated Hono/Vite
services on ephemeral ports, and closes its own processes afterward.

- `browser-report.json`: latest integration/browser checks and explicit limits.
- `test-report.md`: assignment, exact checks, findings, acceptance and handoff.
- `overview-synthetic.png`: actual campus with synthetic person/event records.
- `bobst-events-synthetic.png`, `courant-events-synthetic.png`: selection, camera
  transitions, shared participants and scheduled event cards.
- `person-schedule-synthetic.png`: simultaneous current locations and future plans.
- `mobile-events-synthetic.png`:390pxviewport event card/portrait layout.
- `stern-plan-synthetic.png`: current all-day personal plan and portraits in Stern's
  building card, with blank activity labels preserved.
- `kimmel-future-plan-synthetic.png`: future personal-plan card and portraits without
  current map avatars at Kimmel.
- `mobile-types-top-synthetic.png`, `mobile-types-bottom-synthetic.png`: five
  typed event records, weekday/bold time and separate room metadata, with
  readable full-width mobile details and participant portraits below the text.
- `untrusted-types-synthetic.png`: missing, unknown and malicious unused type
  metadata produces no category icon or external asset request.
- Hosted, label-overlap and final-preview JSON receipts in this folder are owned
  by the orchestrator; their live claims are separate from this synthetic tester
  pass and were preserved unchanged.

All displayed names and event records are synthetic; portrait assets are the
existing approved local images. No hosted records or private source contents are
captured. The test uses the actual event storage adapter/service, source
authorizer and map frontend; database transport and Discord originals are local
fixtures. Mobile type-layout and untrusted-type cases inject safe synthetic
browser response fixtures; normal SQL/runtime checks retain the actual HTTP path.
No live model, hosted migration, production account or deployment is
verified by this folder.

`hosted-verification.json` records root's actual026/027migration versions/hashes, exact zero-difference semantic comparisons before cleanup, unchanged catalogue/profiles, effective grants, rolled-back real service-role RPC mutation, and a live-data production-build Chrome check. Real-data screenshot and private pre-migration backup remain under /tmp, never in this folder. Final user preview is the reloaded5173/API3001pair; extra4193/4195verification previews may be stopped after acceptance.

label-overlap-verification.json records two restored live thought bubbles, exact original-label match and no page errors; screenshot stays private. Independent23presence/source checks cover blank overlap and participant-report chronology. No data changed.

`event-types-hosted-verification.json` records applied028 hash/version, exact five fixed codes, original nine-event preservation/default Other and service-only catalogue permissions. `final-preview-verification.json` records the normal5173/API3001live browser counts and no-icon/text/bubble checks; its screenshot remains private under/tmp. These aggregate receipts contain no source records or roster data.
