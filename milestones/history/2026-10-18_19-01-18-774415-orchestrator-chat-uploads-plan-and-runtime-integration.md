# Chat uploads plan and runtime integration

- Local timestamp / acting role / milestone: 2026-10-18T19:01:18.774415-04:00 / orchestrator / chat production fixes.
- Requested scope: user added file uploads while bug-report/attendance work continues; future identity idea already saved separately.
- Starting state: two coders implementing disjoint attendance/orchestration scopes; concurrent Miro/spotlight commits continue independently.
- Work performed / changed files: parent wired shared map store/service, combined request-local generic map and attendance adapters in server/runtime-app.js; map presence listens for saved chat change refresh. Assigned third coder exclusively frontend/chat-client, upload validation/API/provider conversion and upload tests.
- Decisions: preserve text message action fences; optional bounded in-memory attachments on user messages. Support PNG/JPEG/WebP, PDF and small UTF8 text initially; no persistent upload storage or provider Files API resource. Official OpenAI docs verified Luna image input, Chat Completions base64 image_url and PDF file_data. Broader Office files need separate extraction/Responses implementation and are outside this bounded format set.
- Sources: https://developers.openai.com/api/docs/models/gpt-6-luna ; https://developers.openai.com/api/docs/guides/file-inputs ; https://developers.openai.com/api/docs/guides/images-vision .
- Checks and evidence: read actual local provider/API/browser contracts and official pages. Runtime wiring not yet executable until coder files finish; no build/acceptance claim. Hosted read confirms existing AWS Hack Day Tuesday occurrence, suitable for requested attendance flow. Worker currently lacks PUBLIC_ORIGIN; must provision matching nonsecret origin and deploy authorizer compatibility before attendance rollout so automatic source-backed merges preserve chat participation.
- Resulting state: implementation in progress, three exclusive coders, root owns integration/docs.
- Remaining work: coder tests, independent review, frontend visual/upload evidence, final scoped builds and production deployment verification.
