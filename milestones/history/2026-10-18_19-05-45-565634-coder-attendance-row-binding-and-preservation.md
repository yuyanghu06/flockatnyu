# Attendance implementation and row binding

- Local timestamp / acting role / milestone: 2026-10-18T19:05:45.565634-04:00 / coder and orchestrator integration / chat production fixes.
- Requested scope: current authorized report/attendance/upload fixes.
- Starting state: disjoint implementation scopes; concurrent unrelated changes preserved.
- Work performed / changed files: New attendance service/tool, source-access marker authorization, events.js provenance context and server/map/presence.js context forwarding;20 new attendance tests. Initial independent review caught potential marker reuse by another existing person; patched exact actual row event/person binding and added direct/service/projection regressions. Conditional tool exposure prevents irrelevant attendance proposals for unrelated report/question messages.
- Checks and evidence: Final coder67/67focused tests, APIbuild and owned whitespace pass. Parent core18/18 passed before final binding addition. Independent final acceptance still underway.
- Resulting state: implementation locally verified; independent acceptance and isolated live release pending.
- Remaining work and handoff: complete review/model/build verification, deploy web and worker compatibility, verify hosted outcomes and publish scoped commits.
