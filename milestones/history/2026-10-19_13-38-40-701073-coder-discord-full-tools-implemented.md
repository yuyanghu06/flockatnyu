# Complete Discord chat tool set wired locally

- Role / milestone: coder / Discord full chat-tool parity.
- Local time: 2026-10-19T13:38:40.701073-04:00
- Coder now supplies all shared services to createChatRunner, preserving the same request-local wrappers, provider, prompts, Drive skill and audit lifecycle. Website Google-enable configuration controls Discord Google/Calendar access.
- Top-level source UUIDs now retain the full configured shared scope; the prior Discord audience subset is required and intersected centrally as liveDiscord.allowedSourceIds. Source profile hashing includes both scopes and the Google gate. No configured source list changed.
- Coder passed 64 unaffected policy/tool/runner checks, API build and whitespace. Independent tester reproduced the original missing-adapter failure and is updating scope expectations plus full parity/action tests. Hosted release remains unchanged until acceptance.
