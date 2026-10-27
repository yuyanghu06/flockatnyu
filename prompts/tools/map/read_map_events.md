# read map events

## description

<!-- prompt: description -->
Read saved database map events within the current source grants; this tool never fetches provider originals. Return complete relationships, fixed buildings, safe trackable people and the full read-only event_types catalogue even when event filters match nothing. An unfiltered call covers all events; reuse that result when reconciling multiple records instead of reading once per event. Choose an existing type_id from source evidence, other when unknown; preserve existing type on unrelated edits. Read before updating, retain updated_at for expectedUpdatedAt; merge partial evidence into a complete snapshot. Optional filters select an event or stable source identity for targeted rereads.
<!-- /prompt -->
