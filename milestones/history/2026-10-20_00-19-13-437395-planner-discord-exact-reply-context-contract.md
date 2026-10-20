# Exact Discord reply context contract

- Local timestamp / acting role / milestone: 2026-10-20T00:19:13.437395-04:00 / planner / Discord replied-message context.
- Requested scope: include the exact replied-to message when the user mentions the bot.
- Starting repository state: clean runtime at 346d24b plus root scope journal; no new runtime changes at planning.
- Work performed: read-only review of adapter, bridge, recent loader/validator, live retrieval/client, request context, delivery and relevant tests/docs. Explicit mention skips reference verification, and automatic hour context excludes trigger and older referenced messages.
- Decisions: web derives exact reference by fetching trigger through current source policy; approved actor must match trigger. Follow only direct same-channel/guild reply even older than hour, no chains or attachments. Optional discordContext.reply block (coder naming accepted after planner proposed repliedMessage) is separate from hour metadata. Full text up to 10000 characters, explicit partial/unavailable beyond bounds or failure. Quoted source facts can resolve current user's reference but cannot grant actions, source access or identity authority. Reuse before/after policy checks and final audience reauthorization.
- Checks and evidence: static trace; no external calls, tests or edits claimed for planner.
- Resulting state / acceptance: contract accepted; coder owns runtime/docs, independent tester owns regressions. No collector protocol change required.
- Remaining work and handoff: implement, independently test/review, configured-model check, deploy and verify promoted behavior. Root serializes journal.
