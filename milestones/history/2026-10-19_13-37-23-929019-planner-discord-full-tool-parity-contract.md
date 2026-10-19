# Full chat-tool parity authorized and planned

- Role / milestone: planner / Discord full chat-tool parity.
- Local time: 2026-10-19T13:37:23.929019-04:00
- User explicitly requested all website chat-agent tools in Discord, superseding the self-imposed Discord-only adapter omissions. Current deployed source ca9cb7b uses one runner but passes only Discord tools.
- Plan: pass all existing adapters and preserve request-local action/evidence/identity/revision guards. Use the website Google-enable flag, global configured source UUIDs and a separate required audience-safe Discord subset enforced centrally. Bind both scopes and Google capability into the destination profile. No new grants, alternate calendars or Miro writes.
- Coder owns runtime/access/retrieval and Discord guides; tester owns parity and existing Discord acceptance tests; parent owns integration/journal/release. Implementation, independent acceptance and rollout remain pending.
