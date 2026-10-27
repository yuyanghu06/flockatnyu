# chat-fields

## source-metadata

<!-- prompt: source-metadata -->
Optional source metadata. Omit unchanged metadata on an existing event/participant so the adapter copies stored values; omit for a new direct-chat participant/report so the server supplies attribution. If included, copy exactly from the read result. Provider IDs/URLs are opaque: never decode, rebuild or re-encode them.
<!-- /prompt -->

## lookup-person

<!-- prompt: lookup-person -->
Resolve one existing trackable map person by a stated personName (unique exact full name or unique first name), or use empty arguments for the server-verified Discord speaker. Reuse successful IDs already returned in this request and existing unchanged participants from the current map snapshot after a failed write; do not look up the whole roster again. A changed person or genuinely unresolved identity may need a new lookup. Unknown or ambiguous identity returns no person; ask the user who they mean. Optional exact provider/providerUserId remains supported. No original source link or separate linked-author receipt is needed. Never create profiles or guess IDs.
<!-- /prompt -->

## inherit-event-window

<!-- prompt: inherit-event-window -->
For a NEW participant attending the entire event, omit starts_at, ends_at, starts_local and ends_local to inherit the event window. Never copy parent event timestamps into a new participant. Raw timestamps preserve only the SAME existing person's saved overrides. Use local fields for explicitly requested individual limits.
<!-- /prompt -->

## event-id

<!-- prompt: event-id -->
Existing map event ID from the current authorized read, used only after USER-SUPPLIED facts identify a unique target. A returned ID or an ID you selected for a filtered read is not user selection. If multiple events still match, propose no calls for that ambiguous action; when no other work remains, end tool selection with zero calls so the answer stage asks which entry. Never choose the first ID. Omit id for a new event so the service assigns it.
<!-- /prompt -->

## event-url

<!-- prompt: event-url -->
For EXISTING-event attendance or recovery OMIT url so the adapter retains the exact saved link. Include only for a genuine USER-requested link change or a new supported event link. Existing URLs and opaque IDs must never be decoded, reconstructed, re-encoded or repaired. Do not copy this optional field into attendance/recovery arguments.
<!-- /prompt -->

## upsert-event

<!-- prompt: upsert-event -->
Before an existing-event write, identify a unique user target across ALL observed candidates. If several still fit, propose ZERO calls for that action, including further reads/lookups/writes. If no unrelated requested work remains, END tool selection with zero calls; the separate answer stage asks which entry. Result order or an ID you chose to read cannot select the target. Recovery applies only after this target is unambiguous. Argument shape is {event: event fields, buildings: building rows, people: participant rows, expectedUpdatedAt: the parent event updated_at}. expectedUpdatedAt is a TOP-LEVEL sibling of event, buildings and people, NEVER a field inside event. New or changed times use starts_local/ends_local, no offset, in event.time_zone; the server converts. Raw starts_at/ends_at are byte-exact SAME event/person preservation copies from a map read in this request only. Omit display-only local_display/effective_local_display. Write one complete event/building/participant snapshot to the map database. This tool performs no source fetch, identity lookup or Calendar operation. Existing-event updates use the exact parent event id and expectedUpdatedAt from an explicit map read in this request. Omitted unchanged source metadata and event.url are retained from that local read; direct-chat provenance is filled internally. Preserve all unrequested event and relationship facts. Only an applied result confirms saving; conflicts require a separate read.
<!-- /prompt -->

## participant-label

<!-- prompt: participant-label -->
Optional plain-text activity caption. Omit to retain this same person's caption from the authorized same-event map read; a new participant defaults to empty. Explicit empty string clears the caption; never infer activity from location.
<!-- /prompt -->

## participant-id

<!-- prompt: participant-id -->
Existing trackable roster UUID returned by lookup_map_person; resolve a stated name or verified Discord actor, never invent a person ID.
<!-- /prompt -->

## local-clock

<!-- prompt: local-clock -->
New or changed local clock in event.time_zone: YYYY-MM-DDTHH:mm:ss, optionally .SSS, with NO Z or offset. The server converts using that date’s IANA timezone rules. Do not send the corresponding starts_at/ends_at too. Ambiguous or nonexistent daylight-saving clocks require clarification.
<!-- /prompt -->

## starts-at-preservation

<!-- prompt: starts-at-preservation -->
Preservation only: copy this SAME event/person’s starts_at byte-for-byte from a map read in this request. New/changed times must use starts_local. Current presence may omit the start for the trusted request timestamp.
<!-- /prompt -->

## ends-at-preservation

<!-- prompt: ends-at-preservation -->
Preservation only: copy this SAME event/person’s ends_at byte-for-byte from a map read in this request. New/changed times must use ends_local. Never relabel a UTC clock with a local offset.
<!-- /prompt -->
