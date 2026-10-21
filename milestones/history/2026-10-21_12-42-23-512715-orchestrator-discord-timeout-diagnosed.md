# discord timeout diagnosed

- Local timestamp / acting role / milestone: 2026-10-21T12:42:23.512715-04:00 / orchestrator / shared chat limit increase.
- Requested scope: raise website and Discord chat to30rounds/calls.
- Starting state: prior uncommitted diagnostic journals preserved.
- Work performed / decisions / checks: Live non-secret config confirms180000ms Discord overall deadlines on web and collector versus300000ms website. Content-free audit shows a nearby chat run succeeded in83931ms, including54918ms Discord read; web HTTP bridge later returned499after149258ms. Another nearby run aborted677ms after starting. These records support transport deadline pressure, but exact screenshot-to-run identity is not retained. Set both Discord deadlines to300000ms using existing supported cap; no model/source guard changes.30call source review and builds pass; rollout pending.
- Changed files: shared journal plus scoped implementation/test files described above.
- Resulting state / handoff: see current milestone snapshot; no unrelated source access changes.
