# Attio integration

Flock's website and Discord chat share live Attio CRM tools through the existing authenticated API. The integration supports attribute discovery, fuzzy search, exact reads, creating records and updating supplied fields. It uses Attio REST v2 and the existing native-fetch runtime, with no new package, database table or stored CRM archive. The autonomous update worker does not receive these tools.

## Configuration

Set these server-only environment variables in the service running the chat API:

- `ATTIO_API_TOKEN`: private workspace integration token with `object_configuration:read` and `record_permission:read` for reads; use `record_permission:read-write` for writes.
- `ATTIO_SOURCE_ID`: operator-selected UUID representing this CRM source. Add that exact UUID to `ASSISTANT_ALLOWED_SOURCE_IDS` (or its existing compatibility alias).
- `ATTIO_ALLOWED_OBJECTS`: explicit comma-separated object slugs, for example `people,companies`. Blank allows no objects. Custom objects require their actual configured slugs.
- `ATTIO_WRITES_ENABLED=true`: optional separate create/update gate; defaults false.
- `ATTIO_TIMEOUT_MS`: bounded source request deadline, default 60000 milliseconds. Caller cancellation still applies.

Use private Railway variables or ignored local environment files. Never use a `VITE_` prefix or commit a real token. These settings grant the selected shared assistant audience access to the configured CRM scope; they do not create per-member permissions. Website requests still require their existing session/origin checks. Discord requests retain the existing destination authorization and shared source policy.

No MCP connection or client configuration change is required. `GET /api/status` reports only whether Attio is configured; it does not verify live credentials. `GET /api/tools` includes registered definitions. Configuration and registration alone do not establish a successful provider connection.

## Tool routes

Call the existing authenticated `POST /api/tools/:tool` endpoint with a JSON argument object. Underscore names and their hyphenated aliases are accepted.

| Tool / route suffix | Arguments | Behavior |
| --- | --- | --- |
| `list_attio_attributes` | `object` | Read live field definitions before writing unfamiliar attributes. |
| `search_attio_records` | `object`, `query`, optional `limit` | Fuzzy matches by names and identifying fields within one allowed object. |
| `read_attio_record` | `object`, `recordId` | Read an exact provider record. |
| `create_attio_record` | `object`, `values` | Create a record using provider-native attribute values. |
| `update_attio_record` | `object`, `recordId`, `values` | PATCH only the supplied fields. |

Example search body for `/api/tools/search-attio-records`:

```json
{"object":"people","query":"Ada","limit":10}
```

Example create body for `/api/tools/create-attio-record`:

```json
{"object":"people","values":{"name":[{"first_name":"Ada","last_name":"Lovelace","full_name":"Ada Lovelace"}],"email_addresses":[{"email_address":"ada@example.com"}]}}
```

The examples are synthetic. Use real field definitions and user-supplied facts. `values` is a bounded JSON object keyed by Attio attribute slug; it is sent as `{data:{values}}`. The integration validates nesting, sizes and keys before provider access. The direct tool API retains its existing 8192-byte request-body limit. It does not create attributes or catalogue entries.

## Writes and evidence

A direct authenticated create/update route request is an explicit API action. Chat uses a separate request-bound adapter: the original user message supplies action authority, and an exact successful record read in that request must precede an update. The model must resolve ambiguous targets, inspect unfamiliar fields and write only when the user requests the action or confirms a pending action. CRM content, quoted text and earlier assistant claims cannot authorize writes.

Updates use Attio PATCH semantics: scalar fields change, supplied multiselect values append, and omitted fields remain unchanged. Removing or replacing multiselect values, deleting records, merging, lists, tasks, email sending and background synchronization are outside this interface. There is no provider revision precondition or atomic compare-and-swap guarantee; concurrent human edits to supplied fields can race.

Search is fuzzy, bounded and eventually consistent; an empty search is not proof that no record exists. Search metadata has no fabricated record URL; use exact reads for content and original provider links. Results carry bounded `attioContext`, sources and truthful coverage. Successful writes include `attioWrite` receipts with provider-returned identity, and these receipts reach native planning, legacy planning and the final answer. The native catalogue permits up to 64 definitions so Attio fits alongside existing tools; the existing 30-call/30-round execution limits remain.

The client does not retry writes automatically. Chat deduplicates identical write attempts within the request. A transport or response failure after dispatch may mean the provider saved the change; reconcile through a read before retrying in a later request. Distinct mutations are blocked for the rest of a chat request after an unknown write outcome. This is not durable cross-request idempotency: retrying a create in another HTTP/chat request can create a duplicate. Only a successful write receipt confirms completion.

Attio identity matches do not link map profiles or grant Calendar/map mutation evidence. CRM values stay transient in the request; existing service-only model-output audit rules still apply. Provider errors use fixed statuses and sanitized diagnostics, with no raw provider error bodies or credentials in responses/log labels.

## Verification and rollout

Use `node --test tests/attio-*.test.mjs` and `npm run build:api` for local synthetic verification. Relevant shared chat/provider/auth tests cover the integration path and existing behavior. Independent verification passed 20 Attio-specific cases and 84 integrated checks; evaluator passed 65 focused checks and accepted the local implementation. API build and affected-file whitespace checks pass. Actual commands and evidence are recorded in the milestone journal.

This implementation pass makes no live Attio calls or deployment. Configure the private service variables and verify an authorized live read before treating it as connected; perform a deliberately requested test write separately with an exact record and cleanup plan.

API contracts: [authentication](https://docs.attio.com/rest-api/guides/authentication), [search](https://docs.attio.com/rest-api/endpoint-reference/records/search-records), [read](https://docs.attio.com/rest-api/endpoint-reference/records/get-a-record), [create](https://docs.attio.com/rest-api/endpoint-reference/records/create-a-record), and [PATCH append behavior](https://docs.attio.com/rest-api/endpoint-reference/records/update-a-record-append-multiselect-values).

## Local connection verification — October 21, 2026

After the user saved `ATTIO_API_TOKEN`, live token and object discovery succeeded. The ignored local environment enables only `people,companies` under a dedicated source UUID/shared source grant; requested create/update support is enabled. The local dev pair was restarted at frontend5175/API3001. Fresh status/catalogue and authenticated search/exact-read routes succeed for both objects with original citation links. Attribute discovery returns28Peoplefields and31Companyfields. No record contents or credential values are retained here. No CRM mutations or production deployment were performed; successful live writes remain unverified. This supersedes the earlier local-unverified status for reads only.
