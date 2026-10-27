# Two cap-limited model paths completed separately

- Local timestamp / acting role / milestone: 2026-10-27T18:40:14.997563-04:00 / tester / prompt-markdown-live-2026-10-27.
- Requested scope: Verify the migrated Markdown prompts with the configured live LLM through production chat/update runners and simulated business services.
- Starting repository state: dev/tool-api-services02427ba with completed local prompt migration and concurrent operation-API/readback/testing work preserved.
- Work performed / changed files: Created a fresh source-pinned driver/control/ledger with unchanged production prompts/fixtures and exact network/model fences. Tested only unavailable Contacts and conflict/human-edit recovery, retaining all first-batch records.
- Decisions: Keep prompts and runtime logic unchanged; inference only, simulated business data and writes.
- Checks and evidence: 10 new gpt-6-luna HTTP requests: unavailable3, conflict7; all HTTP200. Unavailable answer is honest with zero writes. Conflict uses one fresh exact reread, two attempts and one applied write with the refreshed parent version, preserving human facts and unrelated rows. Source pins stable, workspace drift empty; cumulative50 within52.
- Resulting state / acceptance: Both followup cases PASS semantically. Across eight distinct cases, six semantic passes and two current behavior failures remain.
- Remaining work and handoff: Root incorporates independent review and preserves original assertion/cap results.
