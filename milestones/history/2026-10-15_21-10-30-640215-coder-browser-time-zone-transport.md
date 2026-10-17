# Browser timezone transport

- Local timestamp / acting role / milestone: 2026-10-15_21-10-30-640215; coder; M32.
- Requested scope: interpret Discord scan dates in the user timezone.
- Starting repository state: dirty shared workspace with completed M29–M31 changes preserved.
- Work performed / changed files: Inspected src/chat-client.js and src/info.md. browserTimeZone samples browser Intl timezone on every send and falls back explicitly to UTC on unsupported detection. streamAssistant includes timeZone within the existing bounded envelope. Coder reported syntax, existing assistant 7/7 and temporary transport/fallback/size checks passing. Independent browser and server acceptance remain pending.
- Decisions: keep time interpretation separate from authorization; no SQL or job schedule changes.
- Checks and evidence: inspected actual implementation and specialist report; broader tests pending.
- Resulting state / acceptance: bounded pass accepted; M32 remains active.
- Remaining work and handoff: finish backend, independent tests and evaluation, refresh local API, integrate guides.
