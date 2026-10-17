# Retired Discord archive

Discord content archiving, weekly/monthly persistence, vectors, accounting and scheduled summarization are retired. This file is a historical pointer, not an archive setup guide. Use [live-only Discord](discord-live-only.md) for the current contract and [operations](discord-launch.md) for supported commands.

The sole Discord-specific table is `discord_view_policies`: channel/thread metadata, stable source UUIDs, exclusions/view settings and discovery checkpoints. The Railway service retains its historical `discord-archive` name but runs metadata discovery only, daily at 10:00 UTC. All message content is read on demand through the bot; larger summaries remain in request memory. No stored-summary fallback or Discord Gateway listener is active. The newly authorized temporary event-buffer target is documented in the live-only guide and remains pending activation verification.

Historical records are immutable:

- [M20 retention integration](../milestones/history/2026-10-12_20-15-25-394452-orchestrator-discord-retention-integrated-and-handed-off.md): the former raw/weekly/monthly lifecycle.
- [M25 summary-only integration](../milestones/history/2026-10-15_17-03-20-942185-orchestrator-live-first-summary-only-integration-accepted.md): the intermediate summary/vector design.
- [M29 live-only integration](../milestones/history/2026-10-15_20-42-07-007652-orchestrator-single-discord-table-live-bot-route-complete.md): the authoritative archive retirement and single-table cutover.

Applied migrations and historical fixtures preserve these transitions; they are not worker inputs. Do not restore old content jobs, replay earlier migrations or infer current storage from historical counts. Miro and unrelated source data are preserved. Current verification and remaining operational work live in the [milestone snapshot](../milestones/milestone.md).
