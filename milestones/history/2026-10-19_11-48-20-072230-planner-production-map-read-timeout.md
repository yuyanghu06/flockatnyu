# Production map read timeout diagnosis

- Local timestamp / acting role / milestone: 2026-10-19T11:48:20.072230-04:00 / planner (independent) and orchestrator / production map refresh.
- Requested scope: automatically show people after agent map writes; user clarified current production unavailable building card.
- Starting state: clean tree; existing tool-completion refresh and30second polling already implemented.
- Findings: actual Railway HTTP logs repeatedly show presence503 at5004–5023ms. Parent authenticated production probes reproduce503 at5181/5154ms, while status/chat remain healthy. Backend total read deadline is5seconds; event/participant provider checks are serial and duplicate originals across relationships/buildings. Chat declaration checks reread the snapshot per attendee.
- Plan: request-local provider-check reuse and validated snapshot reuse, bounded independent concurrency, preserve exact source/event/person gates and fresh policy checks on later requests. Keep automatic post-pending refresh; verify recovery and active/future timing. No stale authorization fallback.
- Checks: independent planner33/33 Node cases pass; synthetic duplicate-work timeout reproduced. No code changed or deployment yet.
- Handoff: bounded backend implementation, frontend recovery, independent tests/browser, then protected production rollout and publication.
