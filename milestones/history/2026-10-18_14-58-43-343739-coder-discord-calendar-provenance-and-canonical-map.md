# Discord scheduled events and canonical map projection

- Local timestamp / acting role / milestone: 2026-10-18T14:58:43.343739-04:00 / coder (orchestrator integration record) / agent-prompts.
- Requested scope: reconcile Discord club events into fixed Calendar, preserve informal map activities and avoid cross-source oscillation.
- Starting repository state: Miro-only Calendar provenance; real model Miro projection repeatedly corrupted copied opaque URL.
- Work performed / changed files: scoped automation adapters/prompt/handler, Calendar tool schemas/client and assigned tests.
- Decisions: exact Discord guild/channel/message provider key and fresh original full-message reread; unchanged author/body and current authorization required. Explicit club-event eligibility excludes attendance-only/personal activity. Native message edits reuse managed identity. New-message corrections, known competing sources and uncertain matches defer. Calendar window must be read completely before event creation. Cross-source writes defer to avoid stale Miro oscillation. Trusted prepareArguments canonicalizes exact observed authorized Calendar identity, source URL, original-link/location notes before receipt hashing; wrong sources/IDs and revoked access remain denied.
- Checks and evidence: coder reported92focusedchecks passing, including6newadapter and2newclientcases. Parent inspected implementation, handler canonical hashing order and conflict/current-message guards. Independent reviewer and4focusedactual-modelcases underway; final acceptance not yet claimed.
- Resulting state / acceptance: implementation frozen for model checks, docs/broaderchecks pending. No real source/event mutation, activation or deployment. Concurrent separately authorized chatCalendar work shares client/context paths and is preserved.
- Remaining work and handoff: final negative review, real create/edit/RSVP/Miro cases, stable14case suite and final regression/build documentation.
