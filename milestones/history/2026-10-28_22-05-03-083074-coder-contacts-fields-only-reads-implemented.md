# Contacts fields-only reads implemented

- Local timestamp / acting role / milestone: 2026-10-28T22:05:03.083074-04:00 / Coder, serialized by Orchestrator / contacts-read-incident-2026-10-28.
- Requested scope: Fix and deploy Contacts list reads while retaining complete raw profiles in storage.
- Starting repository state: Isolated codex/contacts-fields-read-fix from main5e62ffe; original checkout preserved.
- Work performed / changed files: Added migration056 and server/contacts/summary.js; updated search/store parsing, API list and operation search consumers, their guides and dependent synthetic fixtures. Parent inspected actual diff. Exact raw reads/import/update/delete branches remain unchanged.
- Decisions: Dedicated fields-only database RPC delegates existing ranking/filter/paging and keeps ordinality. Separate strict summary validation rejects raw payload keys. Search never captures a full-record write snapshot. Existing256000-byte cap unchanged; old RPC preserved for rollback.
- Checks and evidence: Coder reports node --test tests/contacts-tools.test.mjs tests/contacts-native-fields.test.mjs tests/contacts-http.test.mjs tests/contacts-search.test.mjs:19pass; node --test tests/treg-save.test.mjs tests/treg-exa.test.mjs tests/chat-read-after-write.test.mjs:20pass; node tests/treg-save-model.mjs --self-check:6scripted scenarios,0inferencecalls. Scoped formatter/lint, filelimits, build:api and whitespace pass. Independent large-record suite now34targeted checks pass; full CI/browser underway.
- Resulting state / acceptance: Implementation complete locally; independent final review and release gates pending. No production mutation or deployment yet.
- Remaining work and handoff: Final tests/browser/evaluation, reviewed publication/main release, apply056 and deploy web only, verify authenticated paging and exact raw preservation.
