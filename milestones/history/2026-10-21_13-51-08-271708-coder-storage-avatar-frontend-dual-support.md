# storage avatar frontend dual support

- Local timestamp / acting role / milestone: 2026-10-21T13:51:08.271708-04:00 / coder / storage-avatars.
- Requested scope: migrate portraits to Supabase Storage so new profiles do not require frontend builds.
- Starting state:27local portrait profiles; missing live portrait due old bundle. Preserve unrelated dirty changes.
- Work / decisions / evidence: Frontend coder added src/map-avatar-url.js and updated src/map-presence.js/src/info.md. Strict UUID-bound same-origin avatar proxy applies current people and event attendees; rejects foreign/absolute/wrong-person/query/hash/encoded variants. Temporary approved local-image glob remains only for rollout compatibility. Syntax, scoped whitespace,15resolver assertions and frontend build pass, existing chunk warning only. No external writes/deploy. Independent browser acceptance pending; remove bundled fallback after successful backfill.
- Files/ownership: parent owns storage/migration/journals; backend/frontend coders and independent tester have exclusive files.
- Acceptance / handoff: bounded pass accepted; implementation/uploads/testing underway. No final profile migration/live activation claimed.
