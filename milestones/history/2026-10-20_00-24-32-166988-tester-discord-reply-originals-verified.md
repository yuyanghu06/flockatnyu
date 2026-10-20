# Discord reply originals independently verified

- Local timestamp / acting role / milestone: 2026-10-20T00:24:32.166988-04:00 / tester / Discord replied-message context.
- Requested scope: independently verify exact replied-to originals reach both model phases without relaxing source/identity/privacy boundaries.
- Starting repository state: 346d24b plus new feature; production path regression reproduced before implementation (0/1 baseline: older reply tail missing from both phases despite successful response).
- Work performed / changed files: tests/discord-reply-context.test.mjs adds 37 cases, existing chat-context browser-spoof and bridge approved-actor assertions strengthened, tests/info.md updated. Tests frozen.
- Decisions: whole original content, separate recent window, strict request-local identity and quote treatment, explicit failure/partial coverage.
- Checks and evidence: node --test tests/discord-reply-context.test.mjs tests/discord-chat-context.test.mjs tests/chat-discord-context.test.mjs tests/discord-chat-bridge.test.mjs: 118 passed, zero failed. git diff --check passed. Production HTTP/service/loader/bridge/runner and native-provider synthetic envelopes cover older targets, 10000-character tail, fresh reread, immutability, cross-guild/channel/actor denial, source/policy withdrawal, publication revocation, forward/chain exclusion, deleted/nontext/oversize/fetch failure and cancellation. No source bodies in operational events/client metadata.
- Resulting state / acceptance: PASS with no unresolved implementation finding. All HTTP/model responses synthetic; no external calls or writes by tester.
- Remaining work and handoff: root configured-model scope check, full regressions, guarded release and promoted exact-reference canary.
