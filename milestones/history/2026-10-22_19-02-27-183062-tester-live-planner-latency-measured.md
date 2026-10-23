# Live planner latency independently measured

- Local timestamp / acting role / milestone: 2026-10-22T19:02:27.183062-04:00 / independent tester / live-planner-calendar-tests.
- Requested scope: read-only live latency and tool-outcome verification while parent operates Chrome.
- Starting state: current worker b30c41da, older selected requests active/queued. Extensive user changes preserved.
- Work performed / changed files: filtered read-only Railway logs and authenticated planner status GETs; only ignored evidence/live-calendar-planner/latency-review.json changed by tester. No database operations or external writes.
- Checks and evidence: completed3-call job65bc0857 waited4m41s then9m26s active; model8.3s total, prepare59.6s, Discord111.4s, Calendar67.9s, finish39s and279.7s not separable from logs. Final execution of58a16296 took9m42s/model9.7s;23m42s request envelope included earlier deployment/retries. Fourth request requeued on deployment, still queued23:01:42UTC; fifth running. Partial Discord/Calendar observations recorded honestly.
- Findings: source/setup/other backend work dominates observed latency. finish_batch diagnostic reportsreadyalongside rejected/unknown even in later completed jobs; this is misleading diagnostics, not proof of rejected business work. Historical first-person attendance lookupforbidden corroborated. New chat identity lookupready377ms and actual chat_sent22:59:33UTC.
- Resulting state / acceptance: performance evidence accepted; business results still require parent Calendar/map and Chrome verification. No fixes/release claimed.
- Remaining work / handoff: execute synthetic source cases, verify actual data, save reproducible behavioral findings and independently evaluate final report.
