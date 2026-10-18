# Chat and autonomous planner prompt contract

- Local timestamp / acting role / milestone: 2026-10-18T14:07:20.021102-04:00 / planner / agent prompt design.
- Requested scope: implement source routing, calm chat tone, leadership exclusion, Calendar/Miro/map reconciliation and chat map updates; note future Luma API.
- Starting repository state: extensive existing user changes preserved; chat has internal planning and answer stages, autonomous update agent has queued-input processing.
- Work performed / changed files: independent read-only prompt_plan specialist inspected prompts, adapters, source authorization, Calendar/map contracts, Discord tools and worker cadence. Parent recorded notes/journal only for this planner pass.
- Decisions: planner in user conversation means update agent. Default chat summaries prioritize authorized eboard; general fallback excludes teams, team reads require explicit user request. Calendar is primary schedule source; empty/unavailable falls back to original Miro contents. Miro remains read-only. User authorizes chat source-backed map writes, autonomous Discord activity/attendance and Calendar projection. Future Luma API is an idea, not implementation authorization.
- Checks and evidence: source inspection only. Existing cadence is30eligible inputs or oldest30minutes,60secondcooldown,5secondpoll; empty queue makes no model call. Gaps: four-call chat budget cannot scan all eboard channels individually; chat map tools absent; Calendar map provenance and observed live Discord followups absent.
- Resulting state / acceptance: bounded independent implementation assignments issued to chat_prompt and update_prompt; parent owns Discord scopes/leadership policy. Runtime changes and tests pending.
- Remaining work and handoff: implement bounded aggregate Discord scope read, safe Calendar source identity, request-local chat evidence gates, independent tests/review. No worker activation/deployment follows from prompt work.
