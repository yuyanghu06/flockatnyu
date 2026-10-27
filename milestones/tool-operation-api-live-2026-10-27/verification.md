# Operation API verification — October 27, 2026

The requested runtime/live testing has been performed on `dev/tool-api-services`
from `02427ba`, with local corrections. Independent evaluation **accepts the
scoped API corrections**. Complete planner behavior is **not accepted** because
one real-model scenario discarded unfinished unmatched-attendee intent.

## Changes verified

- Unknown operations return `invalid_request`; known operations hidden by the
  current permission/request catalogue remain `forbidden`. The complete trusted
  catalogue survives child request creation, including Attio's disabled writes.
- If a provider operation completes but its result cannot be encoded as JSON,
  reads return an invalid-response error and writes return
  `write_outcome_unknown`. The write is not replayed. Original service exceptions
  still retain their private identity for lease/audit stopping behavior.
- A prior Calendar test compared per-session function identities. It now compares
  stable tool metadata while retaining its permission and behavior assertions.
- Added meaningful transport regressions in `tests/operation-api.test.mjs` with
  helpers in `tests/fixtures/operation-api.mjs`.

## Verification and practical limits

| Check | Actual result |
| --- | --- |
| Independent actual Hono transport | 17 scenarios pass across all 54 registered routes, with network blocked |
| Independent representative production adapters/runners | 379 pass, 0 fail, 1 existing optional Miro schema skip across 26 files |
| Final focused checks after formatting | 83 pass, 0 fail |
| Formatting, ESLint and physical file limits | Pass; missing local developer tools were run from a disposable installation of the exact lockfile with identical ESLint configuration |
| API syntax/dependency and frontend builds | Pass; frontend keeps its existing large-chunk warning |
| Configured gpt-6-luna Contacts scenarios | Update, ambiguity and unavailable-data cases pass with simulated business storage |
| Configured gpt-6-luna worker scenario | API calls and staged execution complete; unfinished-intent preservation assertion fails |
| Actual live integrations through this branch | Gmail search/read, Drive search/read, Contacts search/read, map event read and Discord catalogue/message read succeed |
| Calendar | Live list returns reauthorization_required; token introspection confirms both required Calendar scopes are missing |
| Member Plans | Not configured locally, so no live check claimed |

The original Contacts update gate used a four-request per-case evaluation cap.
It applied exactly one correct simulated update but ran out of requests before
answering. The unchanged scenario completed in five requests when explicitly
retested with a six-request evaluation cap. Both ledgers remain intact. No
application budgets were changed. Across the original Contacts gate, worker gate
and Contacts retest, **26 actual inference dispatches** occurred. Source pins were
stable; the only later runtime formatting delta was whitespace in adapter.js.

The worker scenario used five simulated Discord originals, production handler,
production adapters, the separately named Calendar-to-map sync and configured
inference for initial/follow-up turns. It handled five queued inputs with 23
operation calls and completed its follow-up in ten model requests. One lookup
returned no person, but the model classified that attendance original as
no-change and left no saved task. The existing assertion correctly rejected the
result. This is a model-decision finding; the evidence does not establish that
the API migration caused it. No broad prompt or task-resolution change was made.

Live reads used individual existing clients and thin tools, avoiding runtime
bootstrap's audit-maintenance side effects. Business requests were restricted to
GETs and explicitly listed read-only database RPCs. The first probe made 17
business requests; the separate Discord follow-up made 25. No guard was triggered,
no paid Treg lookup or live mutation was attempted, and source bodies/identifying
values were kept in RAM rather than evidence. OAuth refresh/account verification
used the existing library. No new grants, public routes, deployments or production
worker run were created. Miro, Attio, Gmail sending and other live writes remain
unverified; their representative mocked transport checks are separate evidence.

## Evidence and next action

Private, ignored evidence lives under
`evidence/tool-operation-api-live-2026-10-27/`: independent `baseline/report.md`,
`baseline/combined-final.tap`, `transport/formatted-pass-report.md`,
`transport/formatted-final.tap`, `live-reads-report.json`,
`discord-followup.json`, `oauth-scope-check.json`, the original and retested
Contacts model ledgers, `worker-model/evidence.json`, and final static/build logs.
These are distinct offline, actual-model/simulated-data and live-provider checks.
The complete npm test suite and browser suite were not run in this scoped pass.

The scoped API corrections are ready for review in the working tree. Renew local
Calendar consent before claiming that live integration; configure Member Plans
before testing it. Investigate the unmatched-attendee no-change decision as a
separate planner correction, with exact intent preservation. Existing unrelated
notes, unfinished tasks and backup stash remain preserved. No commit/push or
release was requested by this test pass.
