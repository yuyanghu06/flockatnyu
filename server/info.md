# Server code

Two executable files stay at this level:

- `index.js` starts the standalone Hono API used during local development.
- `web.js` serves the built website, checks website sessions, forwards API
  requests and connects the existing internal Discord/Miro services.

The remaining code is grouped by what it does. Start with a folder's `info.md`
when tracing a feature; the table below explains where each responsibility lives.

| Folder              | Responsibility                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime/`          | Builds configured services, creates the API application and registers the HTTP handlers from `src/api`.                                                                                                        |
| `chat/`             | Runs a chat request: prompt construction, tool selection, safe result projection, streamed answers, attachments and steering.                                                                                  |
| `contacts/`         | Reads and changes saved Contacts, validates supported fields and performs database search. Native saved JSON stays intact.                                                                                     |
| `treg/`             | Calls Treg people/enrichment providers, preserves private raw results/logs, and supplies separate insert-only Contacts imports. Company/email/phone lookup clients remain dormant until explicitly registered. |
| `google/`           | Google authorization and Gmail, Drive, Calendar and Member Plans clients; Gmail send service and durable send receipts.                                                                                        |
| `discord/`          | Live reads, channel policy, Gateway collection and the Discord chat bridge.                                                                                                                                    |
| `map/`              | Saved event storage, identity lookup, source permissions, complete-snapshot writes, presence and avatar projections.                                                                                           |
| `automation/`       | The autonomous update worker, leased queues, saved tasks, Calendar reconciliation and the separately named Calendar-to-map sync.                                                                               |
| `gmail-enrichment/` | The independent daily cached-sender enrichment service; it never rewrites raw sender-cache inputs.                                                                                                             |
| `audit/`            | Private model-call records, bounded serialization/redaction, stable diagnostic codes and audit retention.                                                                                                      |
| `auth/`             | Website password/session authentication. Planner API authentication remains separately scoped under automation.                                                                                                |
| `shared/`           | Runtime configuration, source-operation timeout defaults and timezone helpers used by several services.                                                                                                        |
| `knowledge/`        | Saved shared club memory and structured bug-report storage.                                                                                                                                                    |
| `providers/`        | Configured language-model transports, bounded retries and ordered fallback behavior.                                                                                                                           |
| `miro/`             | Read-only official Miro MCP access and its private token broker.                                                                                                                                               |
| `attio/`            | The separately configured CRM client and allowed object/source configuration.                                                                                                                                  |
| `skills/`           | Fixed domain guidance supplied to the assistant for authorized Drive navigation.                                                                                                                               |

HTTP route files live in [src/api](../src/api/info.md), where folders mirror URL
segments and each method has its own file. Model-callable adapters live in
[tools](../tools/info.md). Both call server services directly; tools do not call
our HTTP URLs. See [tools and APIs](../docs/tools-and-api.md) for concrete examples.

Provider clients handle their own service. Map, saved-task and Contacts operations
must not hide reads of unrelated source services. Preserve independent access,
identity, field, exact-version and write-receipt checks. The explicitly authorized
Calendar-to-map synchronization remains a separate named operation.

Secrets stay in ignored local settings or private service configuration. Logs and
native provider bodies have their existing private boundaries. Source-only
packagers under `scripts/` follow the reviewed import graph; folder moves must
update those packagers and their tests without widening allowed service access.

Current implementation, verification and release receipts belong in
[milestones/milestone.md](../milestones/milestone.md); historical release prose is
not duplicated in this folder guide.
