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
batch and rechecks current source scope. Both the bundled update-agent and request-local chat adapters register these tools. Errors and
optimistic conflicts remain unsuccessful tool results so inputs stay pending.

`read_map_events` also returns the full immutable event_types catalogue regardless
of event filters. Agent event writes require type_id from study, meeting, event,
social or other. Classify using source evidence, choose other when unknown and
preserve existing type on unrelated changes. Category is independent of event kind.
No type creation/edit tool exists; this adds no broader write permissions.

`chat.js` creates fresh request-local evidence/snapshot/identity receipts around these shared tools. Stateless mutation/lookup cannot supply receipts. Original Discord author or parsed actual Gmail sender must match exact successful identity lookup for changed participation. Configured Calendar originals may establish event facts only, with exact occurrence ID; navigation, untrusted chat identity assertions and Calendar fields cannot establish attendees. Partial snapshots are withheld whole rather than permitting destructive replacement.

Chat additionally gates mutations on affirmative current-turn intent, exact user-supplied originals for personal requests, source-bound identity lookup and a timed window for newly created presence. Request-local duplicate guards prevent renamed copies of the same Discord activity after a successful write.

`chat-attendance.js` exposes find_map_attendance_targets and set_map_attendance in every configured request-local catalogue regardless of user wording. Visibility does not bypass the actual service declaration, identity, date, source or revision checks. A unique current-message named person/event declaration is required; target IDs and revisions must come from the same request. Stateless calls are denied. This narrow going-attendance path is separate from generic provider-backed updates and cannot create events, profiles or buildings. The runtime composes both adapters under the map tool catalogue.

Event phrases use NFKC/case normalization and contiguous whole alphanumeric token matching, so AWS Hackday and AWS Hack Day can resolve the same occurrence despite spaces, hyphens or punctuation. The same rule binds the current declaration and rechecks the event before writing. This formatting normalizer does not infer synonyms or match fragments of larger tokens; catalogue-based model resolution below handles aliases. Person/date/source/concurrency checks remain unchanged.

When normalized titles do not resolve, lookup returns the authorized, unexpired, date-filtered catalogue with fuzzy bigram ranking and bounded notes/location context. The model resolves clear typos or aliases from those actual events; rank alone is not confidence. All candidates are returned up to20, with explicit truncation and no write receipts for incomplete lists. Exact duplicate matches, multiple matching full contexts and unsupported single short names require clarification. Complete candidate selections bind the exact returned event name/source/revision and recheck authorization before an attendance-only write. Person matching remains exact.
