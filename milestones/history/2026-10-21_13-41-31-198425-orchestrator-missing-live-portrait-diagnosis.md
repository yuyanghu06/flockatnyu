# Missing live portrait diagnosed

- Local timestamp / acting role / milestone: 2026-10-21T13:41:31.198425-04:00 / orchestrator / avatar-assets.
- Requested scope: explain initials fallback for the newly added person in supplied map screenshot.
- Starting state: profile/artwork/local build complete, coordinated deployment pending; unrelated working tree unchanged.
- Work / evidence: read current portrait resolver and local asset; authenticated read-only live-site inspection and exact hosted profile read. Supabase profile correctly stores /assets/avatars/Grace.png. Live main-2F71e7tu.js contains no new portrait; generated production image /assets/Grace-uiHl5ucF.png returns404. Local generated image exists and prior build includes it. Runtime resolves approved local avatars through build-time Vite imports, then falls back to initials when no bundled filename exists. Login credential/session stayed private and memory-only. No database/source/service configuration or deployment writes.
- Result: missing live image is deployment mismatch, not a missing person row. Screenshot fallback is expected until frontend build containing the image is deployed.
- Remaining work/handoff: include new portrait in next coordinated web release, then verify authenticated PNG200, bundle mapping and rendered portrait. Existing planner timing guidance is separately pending deployment; this diagnosis did not edit activity records or infer source timing from screenshot.
