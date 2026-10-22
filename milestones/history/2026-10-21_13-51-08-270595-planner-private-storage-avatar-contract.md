# private storage avatar contract

- Local timestamp / acting role / milestone: 2026-10-21T13:51:08.270595-04:00 / planner / storage-avatars.
- Requested scope: migrate portraits to Supabase Storage so new profiles do not require frontend builds.
- Starting state:27local portrait profiles; missing live portrait due old bundle. Preserve unrelated dirty changes.
- Work / decisions / evidence: Read-only planner inspected profile schema, server/frontend sanitization, API/site auth, runtime wiring and deployment packager. Contract: private map-avatars bucket, same-project/person-bound SHA256PNG object URL in existing avatar_url, authenticated same-origin byte proxy, bounded4MiB/4096px/timeout/concurrency and no public grants/keysbrowser. Upload+hashverify before dual-support web rollout, then CAS profileURLs; retain legacy support until hosted acceptance and local originals throughout. Signed/public URLs rejected as unnecessary access expansion. No edits/writes.
- Files/ownership: parent owns storage/migration/journals; backend/frontend coders and independent tester have exclusive files.
- Acceptance / handoff: bounded pass accepted; implementation/uploads/testing underway. No final profile migration/live activation claimed.
