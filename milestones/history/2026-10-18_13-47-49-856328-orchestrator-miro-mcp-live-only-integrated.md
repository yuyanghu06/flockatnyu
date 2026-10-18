# Miro MCP live-only integration

- Local timestamp / acting role / milestone: 2026-10-18T13:47:49.856328-04:00 / orchestrator / miro-mcp-live-only.
- Requested scope: test official MCP, wire chat/update agents, delete legacy REST tooling and board snapshot storage.
- Starting state: concurrent event/UI and later bug report edits preserved.

Both chat and update agents now use the same official live Miro MCP search/canvas/table reader. Old REST tools/client/config/collector/CLI/deployer and Railwaymiro-sync service are removed. No production module imports historical fixtures. Frozen minimal JavaScript harness exists only under tests/fixtures/retired-miro-rest to preserve original applied-migration SQL assertions; obsolete runtime-only REST tests are removed.

Hosted030receipt20261018174413 removes miro_boards,2triggers and9oldsync/cached-read functions, preserving exact source UUID/board/status/enabled/team metadata in knowledge_sources.miro_scope. Transactional hashes confirm every retained public table row, all original source fields/timestamps and retained table ACL/RLS flags unchanged. There are0legacyfunctions; browser execution remains denied and service-only registry reads work. Exact receipt/hash in evidence/miro-mcp/hosted-cutover.json. Concurrent028eventtypes/029bugreports and unrelated map/UI work preserved;030was uniquely reserved after an initial numbering collision.

Codex developer connection is separately installed via shared config+sync/check and authenticated. App-owned OAuth consent, actual SDK refresh-token rotation and private0600atomic persistence verified; three upstream read tools hard-allowlisted. Miro returns boards:write despite requested read-only scopes; neither agent exposes Miro writes. Validated raw board IDs are used upstream because Miro rejects encoded equals; canonical citations remain encoded. Registry scope/team checks run before/after reads and before mutations, including the batch-frozen observed team. Search/frames/grids never grant individual event write identities. Actual canvas objects and native stable row IDs supply independent Calendar source keys. SVG remains inert; oversized JSON fragments use content hashes and cannot grant write evidence.

Independent119retirement checks and final evaluator28checks pass; initial evaluator team-revocation finding fixed and regressed for upsert/cancel/map writes with zero writes. Root36Miro checks, automation suite,20assistant cases, API dependency/syntax and frontend build pass; existing chunk-size advisory remains. Final diff check passes. Actual postcutover local3001chat used3MCPtoolcalls and answered HP from its October25calendar cell, distinguishing promotional entries. Original board/model transcripts remain private /tmp; tracked aggregate evidence has no source bodies.

Isolated real update-agent prepareBatch succeeds with1MCPboard and0modelcalls/0Calendarwrites; persisted worker flag remainsfalse. Exact configured Google Calendar read-only preflight now returnsowner, resolving the older sharing/preflight uncertainty. No Miro or Calendar objects were changed. No agentworker enablement/deployment, sends, commit or push. Current5173/API3001preview restarted and healthy. Railwayretirement leaves discord-events/gmail-events intact.

Acceptance: requested MCP hook-up and snapshot retirement complete. Separate next work only if requested: deploy/enable updateworker and run a bounded Calendar mutation pilot with its full queue/model safeguards. No board snapshot collector or storage should be reintroduced.

- Changed files: new MCP transport/auth/config/reader; server agent wiring/store/Calendar provenance; migration030; runtime legacy removals; independent tests/historical fixtures; affected guides/journals and aggregate evidence.
- Handoff: live-only milestone accepted; separate worker activation remains deferred.
