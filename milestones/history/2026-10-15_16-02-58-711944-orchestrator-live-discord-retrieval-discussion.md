# Live Discord retrieval architecture discussion

- Local timestamp / acting role / milestone: 2026-10-15_16-02-58-711944 / orchestrator / post-M24 architecture discussion.
- Requested scope: Explain why store Discord messages in Supabase when an assistant could read through the bot directly.
- Starting repository state: Existing archive/summary pipeline retained; chat uses scoped archive search and local source scope is empty.
- Work performed / changed files: Read official Discord message API documentation at https://docs.discord.com/developers/resources/message . Source currently documents Get Channel Messages and Search Guild Messages with channel/author/content/date-ID filters; search requires history permission and is restricted by message-content intent. No bot/API/DB request, implementation change or deletion.
- Decisions: Supabase is not a prerequisite for live bot-backed retrieval. Recommend live Discord search/read as a tool for on-demand/current facts and optional stored summaries for recurring broad historical questions; recommendation only, no architecture change authorized or applied in this informational exchange. Preserve existing data/workers until an explicit implementation decision.
- Checks and evidence: Official documentation search/open and relevant endpoint sections read. Endpoint compatibility with the specific bot and operational performance are not verified. Direct retrieval still requires member-appropriate source access; bot visibility alone is not member authorization.
- Resulting state / acceptance: Architecture tradeoff explained; archive supports reusable historical summaries and cross-source indexing while live tools can simplify the immediate assistant.
- Remaining work and handoff: If requested, independently plan/implement bounded live search/history tools and verify bot endpoint support, permissions, citations and limits. Existing product tasks remain unchanged.
