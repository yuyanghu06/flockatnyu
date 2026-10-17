# User timezone scan contract

- Local timestamp / acting role / milestone: 2026-10-15_21-10-30-637051; planner; M32.
- Requested scope: interpret Discord scan dates in the user timezone.
- Starting repository state: dirty shared workspace with completed M29–M31 changes preserved.
- Work performed / changed files: Read-only planner inspected chat transport, API, prompts and both Discord execution paths. Accepted a per-request IANA timezone plus one trusted server clock, strict calendar boundaries, DST-aware conversion and explicit UTC compatibility fallback. No code or external state changed. Implementation and independent acceptance remain pending.
- Decisions: keep time interpretation separate from authorization; no SQL or job schedule changes.
- Checks and evidence: inspected actual implementation and specialist report; broader tests pending.
- Resulting state / acceptance: bounded pass accepted; M32 remains active.
- Remaining work and handoff: finish backend, independent tests and evaluation, refresh local API, integrate guides.
