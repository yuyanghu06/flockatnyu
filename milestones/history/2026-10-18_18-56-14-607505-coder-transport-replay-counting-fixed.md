# Miro quota counts every authenticated transport replay

- Local timestamp / acting role / milestone: 2026-10-18T18:56:14.607505-04:00 / coder / Miro quota recovery.
- Requested scope: Implement and deploy quota-aware live Miro reads while preserving Discord/Calendar processing.
- Starting state: Concurrent frontend edits preserved; earlier diagnostic identified exhausted 100-call Free-plan daily quota.
- Work performed / changed files / checks / result / handoff:

Core coder moved reservation to the physical HTTP tools/call send boundary after fixed-origin validation. Broker401 retries and native SDK OAuth replays now each reserve, normal sends are not double-charged, and transport/operation cancellation checks precede send. Independent native/broker last-slot negatives prevent an81st physical request. Forty-eight focused quota/auth/broker cases pass with syntax/whitespace checks; final source frozen. No cloud/provider/model calls. Parent full regression/build/package/deployment acceptance follows.
