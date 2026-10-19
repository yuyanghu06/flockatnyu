# Site feedback independent acceptance

This folder contains only synthetic local browser evidence. No email, personal
screenshot, provider output, credentials, live source responses or real API/model
calls were used. The map-colored background is a fixture, not a campus-map check.

- Milestone / role / scope: site-feedback / tester / independent assistant UI acceptance and focused offline regressions.
- Starting state and files inspected: AGENTS.md, notes.md, rolling milestones/to-do, latest linked release history, docs/agent-workflow.md, assignment/report templates, assistant/client/CSS, existing scroll/dismiss/upload browser checks and relevant test suites. Existing unrelated working-tree changes were preserved.
- Work performed and changed files: added tests/feedback-browser.mjs; browser-receipt.json plus three standard viewport and four shrink screenshots in this folder; no implementation or existing test edits.
- Decisions and assumptions: headless installed Google Chrome; isolated configFile:false Vite on 127.0.0.1 with no API proxy/environment. Platform metadata is emulated for keyboard checks. Actual mouse-wheel input establishes manual scroll intent; programmatic scrolling during an active follow animation is not treated as user intent.

## Executed checks

- `node --check tests/feedback-browser.mjs`: exit0.
- `node tests/feedback-browser.mjs`: final exit0, isolated port53536, six scenarios, zero external requests/page errors/layout findings. The server closes in finally. Full detailed geometry is in browser-receipt.json.
- `node --test tests/assistant.test.mjs tests/assistant-markdown.test.mjs tests/chat-attachments.test.mjs`: exit0, 45/45.
- `node --test tests/assistant-presentation.test.mjs tests/feedback-discord.test.mjs tests/discord-live-chat-summary.test.mjs tests/discord-summary-execution-budget.test.mjs`: exit0, 34/34, synthetic/PGlite only.
- Isolated Vite port53432, `MAP_URL=http://127.0.0.1:53432 node tests/assistant-scroll-browser.mjs`: exit0; desktop1280x844, mobile390x844 and short390x480; four streamed turns each, all scroll gaps0, minimum bubble clearance21.54px, manual scrolling retained.
- Same isolated server, `MAP_URL=http://127.0.0.1:53432 node tests/assistant-dismiss-browser.mjs`: exit1 only in its final unrelated map event-row CSS assertion (metadata gap expected2px, actual4px). Its preceding assistant assertions passed: white send arrow, outside/Escape closing animation, restored focus/draft, interrupted exit, reduced motion, smooth height growth with31distinct measured heights and stable top. Existing test was preserved; no map change requested.
- `MAP_URL=http://127.0.0.1:53432 node tests/chat-uploads-browser.mjs`: exit0; its own isolated Vite server; desktop/mobile picker, image previews, remove, attachment-only request/history, hidden completion, map-refresh event, failure draft retention, invalid uploads, paste/drop, stop and bounded layout pass.

## Acceptance and findings

The independent fixture passes transcript above a bottom composer; three streamed
turns at1280x844,390x844,390x480; visible, hittable send/Stop button and unclipped
textarea during24frame samples; initial multiline growth; four uploads plus
validation/server errors; scrollable transcript and retained reading position
while new tokens arrive; animated Stop and actual abort; hidden response
completion/reopen and unsent draft retention. Synthetic raw/encoded Miro board
IDs become “Miro board”; a human title remains; href values are exact, target/rel
are safe, and JS/data/file/relative sources are omitted. Mac Meta+K and Windows/
Linux Control+K labels/ARIA, actual keyboard opening/focus, and modal keyboard/
pointer/wheel isolation pass.

Independent checks found two real defects during implementation: initial height
growth clipped the bottom composer (panel bottom264.91 vs textarea275.91), and
shrinking a populated tall viewport to390x300 retained stale minimum heights
(panel bottoms352/381). Both were reported and corrected by the frontend owner.
Final resize-in-place checks from both desktop/mobile844 heights to390x480 and
390x300 pass; panel bottoms468/288 respectively, preserving a12px lower inset.
Final screenshots were visually inspected at desktop, mobile and300px height.

Acceptance verdict: PASS for assigned assistant feedback behavior; legacy mixed
assistant/map dismissal script remains partially failing in its unchanged map CSS
assertion. No native mobile keyboard/device, live model/provider/source,
production deployment, or campus geometry/camera checks were performed.

Folder-guide updates needed: orchestrator should link this folder from
evidence/info.md and tests/feedback-browser.mjs from tests/info.md, then serialize
this report in the shared milestone journal.

Handoff: independent acceptance complete. Review the final diff and production
rollout separately; do not infer live source/model behavior from synthetic UI
fixtures. Other specialists' implementation/test files were not modified.
