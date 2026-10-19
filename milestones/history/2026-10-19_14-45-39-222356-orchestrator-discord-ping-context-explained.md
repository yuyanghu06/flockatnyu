# Current Discord ping context inspected

- Local timestamp / acting role / milestone: 2026-10-19T14:45:39.222356-04:00 / orchestrator / eboard-discovery-availability follow-up.
- Requested scope: explain what channel and caller context is automatically injected into a bot ping.
- Starting repository state: reviewed035 repair remains local; hosted application is blocked by project-owner authentication. Existing working-tree changes preserved.
- Work performed / changed files: read current chat adapter, access authorization, bridge, request/recent-context validators, context loader, runner and planning/answer prompts. Journal only; no runtime edits.
- Decisions: distinguish explicit injected fields from metadata usable by tools. Channel ID is injected but channel name is not. Caller fields are revalidated from the live guild member before prompt construction. Recent same-destination originals and ID/name directory are separate from caller identity.
- Checks and evidence: source inspection confirms actor user ID/guild ID/username/display name, channel/thread/request IDs and source profile; previous exact hour of bounded text with author/time/message identifiers; directory mapping; per-member/destination expiring chat history; request time and shared memory when available. Both planning and answer prompts receive automatic Discord contexts. No new tests or live reads required for this explanation.
- Resulting state / acceptance: explanation supported by current source. No claim that blocked035 was applied or that channel names are automatically supplied.
- Remaining work and handoff: existing hosted authentication/application/base-channel verification remains pending; user did not request context changes.
