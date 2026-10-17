# Live-first chat orchestration integrated locally

- Local timestamp / acting role / milestone: 2026-10-15_16-25-07-875554 / orchestrator / M25/M26.
- Requested scope: Summary-only Railway retention and embeddings, live-first Discord chat with stored fallback, and prepared Google Gmail/Drive runtime access.
- Starting repository state: Existing dirty M23/M24 changes preserved; disjoint specialist ownership and root integration.
- Work performed / changed files: Root integrated shared app/index/config/package and new assistant-context.js, explicit local connector capabilities, two planning rounds/four calls, bounded safe sources, live-first prompt and server-gated labelled summary fallback. No automatic raw archive lookup remains. Added RAM-only live-chat-summary.js for larger exact windows, capped12 summary dispatches/$0.10 per chat. Installed Google auth dependency, OAuth env loading/ignore and updated local non-secret access flags only. Independent connector103 checks and source build passed before helper follow-up; helper tests/review pending. Root read-only hosted baseline shows1174 raw/1 revision/722 summaries/218 sources/0 source grants/0 active leases. No schema/deploy change yet.
- Decisions: Preserve existing summaries, citations, source policy and receipts. Google consent remains pending; do not expose credentials or grant production members bot visibility. Live permission denial and successful empty reads cannot trigger stored fallback.
- Checks and evidence: Actual outcomes described above; fixtures do not establish current hosted/runtime behavior. No unexecuted check claimed.
- Resulting state / acceptance: Local pass recorded. Hosted rollout and helper acceptance remain distinct pending work.
- Remaining work and handoff: Complete helper review and authorized cloud cutover; verify summary/vector counts, original cleanup, discovery and scheduler. Root owns journal/deployment/shared guides.
