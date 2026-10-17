# Floating assistant and local LLM integration plan

- Local timestamp / acting role / milestone: 2026-10-15_15-50-32-272982 / planner (actual spotlight_plan specialist, root journal) / M24.
- Requested scope: Build base LLM integration and replace tall assistant sidebar with floating Spotlight UI.
- Starting repository state: M23 accepted but uncommitted; Vite listening on 5173, no API listener on 3001. Existing server-only model configuration is present; no values copied to docs.
- Work performed / changed files: Read-only specialist inspected assistant/client, provider/API/configuration, package/Vite and interaction source. Root records plan; no application edit in this pass.
- Decisions: Reuse existing OpenAI-compatible/Anthropic streaming adapters; paired local startup remedies likely proxy failure. Implement native modal dialog, compact centered query-first layout, launcher and Cmd/Ctrl+K, Escape/outside close and focus restoration. Start collapsed; retain drafts/history, streaming cancellation and safe source links. Root guards captured map wheel during modal use.
- Checks and evidence: Source inspection establishes current npm dev starts only Vite and proxy points at 3001. Root checked configured flag and listener presence without exposing credentials. No model call or live service mutation.
- Resulting state / acceptance: Bounded plan accepted for independent UI and startup/client coding ownership. Test with offline full transport fixtures and desktop/mobile browser interaction; evaluate before completion.
- Remaining work and handoff: UI coder owns src/assistant.js/css; integration coder owns tools/dev.mjs, package.json, vite.config.js and src/chat-client.js. Root owns map wheel bridge and guides/journal. Tester owns tests/evidence. No deployments, cloud/schema/Discord/Drive operations.
