# URL-shaped individual API files requested

- Local timestamp / acting role: 2026-10-27_14-13-50-055920 / orchestrator.
- User refinement: every route gets its own JavaScript file, folders mirror URL definitions, and each endpoint documents both technical specifications and a plain-English reason for existing.
- Implementing src/api as /api base with [parameter] folders and method files, e.g. contacts/[id]/patch.js; service /healthz exception documented separately. Shared helper modules and one registration composer remain separate. Dormant lookup handlers remain unmounted.
- Preserve URLs, methods, auth/origin/source/version/receipt checks, bounded inputs and existing responses. Update package allowlist to admit parameter folder names only within server-only src/api.
- Existing frontend/CI review accepted; final endpoint restructuring and all integrated checks remain pending.
