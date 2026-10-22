# Calendar backend pagination implemented locally

- Local timestamp / acting role / milestone: 2026-10-21T17:13:34.211140-04:00 / coder / tool failure diagnostics.
- Requested scope: move Calendar continuation into backend and reduce repeated map reads.
- Starting state: previous receipts/diagnostics and unrelated changes preserved.
- Changed files: Calendar client/shared tools/chat wrapper, Calendar chat/update prompts, worker adapter and Calendar-only assistant context, owned guides.
- Work performed / decisions / evidence: Calendar listing now traverses backend-owned provider pages under20pages/200uniqueevents/14KiBevent-output/60second aggregate bounds, retaining explicit partial coverage. Shared client/tool16KiB and chat20KBcontext contracts remain. Agent schema/prompts expose no Calendar cursors; low-level single-page and bounded batch duplicate APIs remain. Final account/ACL rechecks withhold content on authorization revocation. Worker coverage requires contiguous complete unfiltered full-mode windows, narrows incomplete scans recursively, reuses bulk map state and recommends merged upserts for observed stale/missing projections. Both early/backend conflicts invalidate observations; successful rereads replace covered snapshots. Coder127focusedtests pass and prompt24501bytes fits24576byte budget; final2line conflict guard syntax/whitespace checked, independent final regression pending.
- Result / handoff: runtime frozen; independent combined tests/evaluation required. No live API/database writes or deployment.
