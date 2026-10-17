# M29: Discord live access and one catalogue table — complete

The user requested removal of every durable Discord summary, vector, job and
accounting table. Migration017 now leaves only discord_view_policies for Discord
metadata/settings/checkpoints, alongside Miro and the non-Discord source registry.
All content comes through live read-only bot access; on-demand summaries stay RAM-only.

Independent local testing/review, hosted catalogue/policy/Miro preservation,
summary-service retirement and reviewed discovery-image deployment are complete.
A real bot read and refreshed local API are verified. Future natural metadata
cron execution remains a separate observation. See ../milestone.md for receipts.
