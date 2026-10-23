# Shared map event tools

`index.js` defines read_map_events, lookup_map_person and upsert_map_event for
trusted chat and update-worker adapters. The shared service validates fixed
catalogues, complete event/building/person snapshots, current source visibility
and fresh optimistic revisions. Existing unrelated relationships must survive
edits; stale writes require rereading. Every participant can appear at every
linked building, with intentional simultaneous locations.

`chat.js` exposes those same three operations. Person lookup accepts a supplied
unambiguous roster name or empty arguments for the verified Discord speaker.
Direct chat updates may omit source metadata, which the server fills internally.
Existing event.url also survives omission when updating an event; explicitly
supplied values still follow ordinary validation, and new events inherit no link.
No separate attendance tools, declaration parser, source-link requirement or
linked-author receipt gate is exposed. The model interprets ordinary location and
participation statements and asks when essential identity/event details are
unclear, retaining the conversation through clarification. Request-local calls
remain authenticated; stateless mutations and profile/building edits are denied.

For attendance at an existing event, read its complete snapshot, resolve the
person and merge going/planned participation using upsert_map_event. Preserve the
event facts, source identity, other participants and optimistic revision. An RSVP
does not create another event or modify Calendar. Only an applied mapWrite receipt
confirms saving, and going does not mean verified physical arrival. Historical
#attendance links remain readable through strict source-access validation; new
chat writes use the normal map tools and attribution.

The worker has separate original-source and person-identity checks. Its new
personal activities originate in Member Plans and deterministic Calendar-to-map
projection. Cache reads grant no live-source or mutation authority. Shared chat
Miro retrieval remains separate from worker scope.

read_map_events returns fixed event_types: study, meeting, event, social and
other. Unknown classification uses other; preserve an existing type on unrelated
edits. No profile, building or category creation/edit tool exists. Current presence
without an explicit end follows the two-hour policy; future plans need supported
times. Partial read snapshots are withheld rather than presented as safe complete
replacements.

Trusted reads share provider checks only within the same read and use bounded
concurrency. Later reads and writes recheck access. Discord-to-person label
context accompanies normal map-tool results without granting additional access.

Applied chat upserts return a bounded mapSubmission from the actual arguments after attribution/inheritance. The model sees it as mapWrite.submitted only with a valid applied receipt. Its basis is submitted_values_not_readback; complete=false marks omitted relationships and it does not invent service defaults. Failed or conflicting writes have no such applied snapshot.

Chat descriptions require existing occurrence lookup and preserve its timed window for “the entire time”; Calendar fallback cannot fabricate a duplicate when map projection is unavailable.
