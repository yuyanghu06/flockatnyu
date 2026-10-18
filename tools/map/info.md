# Shared map event tools

`index.js` defines the shared `read_map_events`, `lookup_map_person` and
`upsert_map_event` interfaces reusable by trusted chat/update-agent adapters. The
service under `server/map/events.js` validates records and current source access.
Identity lookup accepts exact linked provider identifiers, never names or profile
creation. Writes replace one complete event snapshot and use the existing
`updated_at` optimistic token; callers read and merge partial evidence first.
Building and person catalogues are fixed. Every event participant can appear at
every linked building, and simultaneous locations are intentional.

Definitions alone grant no access. Automation additionally binds writes/identity
lookups to supporting queued input IDs or live Miro evidence in the prepared
batch and rechecks current source scope. The bundled update-agent adapter registers these tools. Chat registration is deferred. Errors and
optimistic conflicts remain unsuccessful tool results so inputs stay pending.

`read_map_events` also returns the full immutable event_types catalogue regardless
of event filters. Agent event writes require type_id from study, meeting, event,
social or other. Classify using source evidence, choose other when unknown and
preserve existing type on unrelated changes. Category is independent of event kind.
No type creation/edit tool exists; this adds no broader write permissions.

`chat.js` creates fresh request-local evidence/snapshot/identity receipts around these shared tools. Stateless mutation/lookup cannot supply receipts. Original Discord author or parsed actual Gmail sender must match exact successful identity lookup for changed participation. Configured Calendar originals may establish event facts only, with exact occurrence ID; navigation, untrusted chat identity assertions and Calendar fields cannot establish attendees. Partial snapshots are withheld whole rather than permitting destructive replacement.

Chat additionally gates mutations on affirmative current-turn intent, exact user-supplied originals for personal requests, source-bound identity lookup and a timed window for newly created presence. Request-local duplicate guards prevent renamed copies of the same Discord activity after a successful write.
