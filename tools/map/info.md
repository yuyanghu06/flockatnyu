# Shared map event tools

`index.js` defines read_map_events, lookup_map_person and upsert_map_event for
trusted chat and update-worker adapters. The shared service validates fixed
catalogues, complete event/building/person snapshots, current local source grants
and optimistic revisions. Reads and lookups access only saved map data; writes
dispatch only the map database transaction. No map tool fetches provider originals. Existing unrelated relationships must survive
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
personal activities originate in Member Plans. Calendar/map synchronization is
a separately named operation; a map write never triggers it. Cache reads grant no live-source or mutation authority. Shared chat
Miro retrieval remains separate from worker scope.

read_map_events returns fixed event_types: study, meeting, event, social and
other. Unknown classification uses other; preserve an existing type on unrelated
edits. No profile, building or category creation/edit tool exists. Current presence
without an explicit end follows the two-hour policy; future plans need supported
times. Partial read snapshots are withheld rather than presented as safe complete
replacements.

Trusted reads validate exact local source/provider bindings against saved map
data. Miro board enabled/source/team metadata is read only through the database
registry, never live Miro content, and retained in the private read context. An internal
JSON-invisible read receipt supplies subsequent local write validation; updates
without it require an explicit map read. Writes do not reread the database or
perform a hidden readback. Discord-to-person label
context accompanies normal map-tool results without granting additional access.

Applied chat upserts return a bounded mapSubmission from the actual arguments after attribution/inheritance. The model sees it as mapWrite.submitted only with a valid applied receipt. Its basis is submitted_values_not_readback; complete=false marks omitted relationships and it does not invent service defaults. Failed or conflicting writes have no such applied snapshot.

Chat descriptions require existing occurrence lookup and preserve its timed window for “the entire time”; Calendar fallback cannot fabricate a duplicate when map projection is unavailable.

Chat uses starts_local/ends_local for new or changed clock times, with no UTC
suffix or offset. The server converts in event.time_zone using the actual date,
so 7 PM in New York becomes 23:00Z in summer and 00:00Z the next day in winter.
The shared map service and worker still receive ordinary offset timestamps.
Raw starts_at/ends_at in chat are preservation copies only: each must exactly
match the corresponding boundary for the same event/person from a map read in
that request. A new current presence may omit its start for the trusted request
clock. Existing two-hour defaults remain, and an explicit local end wins.
Invalid, ambiguous or nonexistent clocks, both boundary forms, and changed raw
timestamps reject before a write. An explicit new absolute instant must first
be represented by an unambiguous local clock; a repeated daylight-saving hour
cannot be selected through a raw timestamp bypass.

Chat reads and applied submissions include display-only local_display on events
and effective_local_display on people. These preserve raw stored timestamps and
show the request-local date, 12-hour clock, timezone label and actual offset for
each boundary. Participant displays include inherited event boundaries. Display
fields never enter storage, optimistic comparisons or raw-copy proof. The model
must omit them from upserts. Enriched reads still obey the complete-snapshot
64 KB limit; applied submissions retain their 32 KB completeness bound.
The model-facing read projection omits optional null time fields so inherited
participant windows can be copied using the declared input shape. The underlying
read and private optimistic-write snapshot keep those nulls unchanged. Multiple
matching saved records require a focused clarification before a mutation; a
correction does not authorize selecting the first matching event.
This target-choice instruction also appears beside the read/write tool definitions
and the final planning decision. Narrowing a read to an ID the model chose does
not resolve the user's choice. Two candidate rooms for one correction remain
one unresolved request until the user identifies the entry.

Failed map writes now carry a bounded mapFailure in model context, with the
attempted event ID and fixed reason/field hints. Duplicate person/building IDs
and invalid event/participant windows identify the collection to correct;
numeric row positions refer only to submitted visible rows. Validation failures,
conflicts and denials mean that proposal was not applied. An unavailable result
or missing receipt means saving is unconfirmed, since a transaction may have
committed before its response failed. No error body or exception is forwarded.

Successful person lookups and unchanged IDs in the complete map snapshot remain
usable after a failed write. If the read already satisfies the user's request,
report that existing state. Otherwise correct only the supported faulty field,
preserving unrelated facts. A conflict needs the existing bounded targeted fresh
read/revision, without repeating person lookups. Unknown failures do not restart
the roster or source workflow; a separate map read may reconcile an uncertain
write. The runner never forces a recovery sequence or silently repairs rows.

Duplicate-ID feedback concerns the rejected proposed payload, not duplicate rows
stored in the database. Recovery first compares the existing read with the user's
request; an already satisfied request needs no mutation. Existing-event attendance
and recovery arguments omit event.url and unchanged provenance so the adapter
retains exact saved values. The chat URL field description permits a supplied link
only for a user-requested link change or a supported new event link; opaque saved
URLs are never reconstructed.

For a local duplicate-ID rejection, mapFailure may include readComparison with
deduplicatedMatchesRead=true, basis=request_local_authorized_read and the exact
readVersion. It means removing identical proposed duplicates would reproduce
the previously observed authorized snapshot. The invalid result stays invalid;
this is neither an applied receipt nor a user-intent decision. Missing/extra rows,
conflicting duplicates, changed facts or a different parent revision prevent the
hint. It requires the same principal scope and latest valid explicit map-read
receipt. Every later read attempt clears that latest receipt before dispatch,
including failed/denied reads; ordinary raw write snapshots remain unchanged.

Prompt decisions follow a strict order: identify the unique user target across
all observed candidates, compare that target with the requested state, then
recover a failure only for that same identified target. An ambiguous target
requires clarification before any mutation. The final planning instruction is
the target-selection check; the write tool keeps a concise selection reminder
without repeating the full recovery paragraph.
Once multiple matches remain unresolved, planning proposes no further calls for
that action. If no unrelated requested work remains, it ends tool selection with
an empty call list so the separate answer stage can ask which room or entry was
intended. Further filtered reads or person lookups cannot choose for the user.
The chat event ID description carries the same user-selection requirement.
