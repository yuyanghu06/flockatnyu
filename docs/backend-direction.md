# Current backend direction

The Tech@NYU assistant is the primary product; the campus map supports it. The application uses a Hono API, server-side model adapters and Supabase. Source collectors are separate deployable processes. Developer MCP authentication is distinct from runtime credentials and application authentication.

## Current services

The Railway `tech-nyu` project production environment contains exactly three services:

| Service | Responsibility | State |
| --- | --- | --- |
| `discord-events` | Receive native message creates, edits and deletions into the temporary queue; refresh channel metadata. | Active continuous collector, no cron/backfill/LLM. |
| `gmail-events` | Validate notifications, reconcile history, renew watch and enqueue email payloads. | Active; signed notifications and real email enqueue observed. |
| `miro-sync` | Preserve explicitly scoped board originals, layout, relationships and freshness. | Provisioned and paused with `MIRO_SYNC_ENABLED=false`. |

All share Supabase. The [five-table schema](database-tables.md) stores metadata, Miro records, temporary inputs and operational state. Discord and Gmail deploy independently with no model runtime. Discord ingestion covers eligible guild channels except blacklisted channels/categories and descendant threads; explicit manual disables survive metadata refresh through020. Assistant read allowlists remain independent. No LLM service or Calendar/map write adapter is deployed.

## Source and automation boundaries

Discord content is read live through the bot. Larger on-demand summaries remain in request memory. Durable Discord originals, summaries, embeddings, accounting and summary schedules were retired; there is no stored fallback. Current source allowlists, enabled channels, exclusions, bot permissions and final catalogue checks still apply. See [live-only Discord](discord-live-only.md).

Gmail/Drive runtime reads require account OAuth scope. Private content cannot be accessed with a generic API key. The active Gmail collector does not send email, edit Drive files or run an LLM. [Automation](agent-automation.md) uses a temporary cache and metadata-only leases/receipts, with trusted source policy and explicit tool adapters. Concrete map/Calendar writes and production LLM activation remain follow-up work.

Miro ingestion and direct tools are read-only and explicitly scoped; paused sync is not evidence of fresh board data. Luma remains deferred and no Mural integration is implemented. Shared source scope replaces per-person membership tables; service-only database access and backend administration checks remain. This does not publish an unauthenticated production API.

## History and open work

Earlier archive, compaction and summary designs are historical. Their migrations and [immutable pass history](../milestones/history/info.md) remain for audit; do not treat old commands as deployment instructions or replay applied SQL. The [Discord history pointer](discord-archive.md) links the cutovers.

Current evidence and next steps belong in the [milestone](../milestones/milestone.md) and [to-do list](../milestones/to-do.md). Production authentication, durable event/location context, Calendar scope/write ownership and final product/provider choices remain open. See [assistant setup](assistant-backend.md) for local runtime behavior.
