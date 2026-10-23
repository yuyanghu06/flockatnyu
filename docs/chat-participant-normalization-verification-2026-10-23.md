# Chat participant labels and duplicate rows — October 23, 2026

Chat accepts an omitted participant `label`: it copies that same person's caption from the authorized same-event read, or fills `""` when none exists. Explicit `""` still clears a caption; invalid nulls still fail. No hidden reads are added.

After time and omitted-source completion, identical participant rows collapse to the first row. Differing labels, attendance, boundaries or provenance reject with original submitted indices. Exact source strings are compared before existing chat attribution rewrites a URL. Shared map/worker schemas, source permissions, optimistic revisions and duplicate-building rejection remain strict. New event identity uses unique canonical participant UUIDs. New whole-event participants are instructed to omit time overrides and inherit the event window.

## Verification

- Independent component cases use the real chat adapter, map service and runner with in-memory storage. They check same-person/same-event labels, explicit clearing, default empty text, invalid null/unknown fields, object-order/default equivalence, UUID casing, conflicts, exact saved facts, versions, hidden-row privacy and stable creation identity. Combined participant/recovery/time checks pass: 34 cases.
- Actual configured `gpt-6-luna` selects every tool and final reply. The existing-caption attendance update passed in four requests, preserving exact captions and unrelated fields.
- The initial repeated-person addition failed after five requests because it copied parent timestamps into a new participant's overrides. The time validator prevented storage. That failure remains retained. A participant-schema description now explains whole-event inheritance; the unchanged strong test passes in five requests with one saved person, one applied write, empty label and inherited boundaries. The final answer accurately confirms attendance.
- Total actual inference: **14 requests**, including the retained failure. Gates allow 10 total/5 per case initially and 5 total for the declared failed-case retest, including final answer/retries. Network is restricted to the configured inference endpoint; all business services are synthetic. No model replies are scripted.
- The model itself supplied unique participants, so component tests establish adapter deduplication. The existing-caption model case passed before the narrow boundary-description change. Independent final evaluator ACCEPT, all 146 frozen hashes verified.
- Optional old `update-agent-map.test.mjs` worker checks have five failures identically on unchanged HEAD and the working tree. They are unrelated old worker expectations, not claimed fixed by this chat patch; `map-contracts` passes.

Private synthetic ledgers and failed runs are retained under ignored `evidence/chat-map-participants/`. Durable tests are `tests/chat-map-participants.test.mjs` and the explicitly enabled bounded `tests/chat-map-participants-model.mjs` harness.

## Release

Prepared web package contains 278 files from accepted HEAD 267e7f7 plus only the final chat overlay; adapter SHA256 `8fcdc9ad16dc0a9ee023a308258aea8fee3a8796638dda3086410c0cffdb7706`. All ten previously verified frontend bundles match. Release status and hosted checks are recorded in the current milestone; preparation alone is not deployment confirmation.
