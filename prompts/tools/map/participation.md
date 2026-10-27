# participation

## already-correct

<!-- prompt: already-correct -->
The requested attendance is already correct. No map change was made and no applied receipt exists. Explicitly resolve these tasks with no_change_needed/already_correct; this is not a successful mutation.
<!-- /prompt -->

## target-hints

<!-- prompt: target-hints -->
For worker attendance changes choose eligible=true. mapEventId is the map UUID; calendarEventId is the separate provider ID. Do not send these hints inside event facts.
<!-- /prompt -->

## description

<!-- prompt: description -->
Patch only verified people on ONE existing Calendar-projected map event. Bind exactly one fully read current participation task per changed person in inputIds; saved operation/calendarKind/provider calendarEventId/personId must match. eventId is the map UUID and expectedUpdatedAt is its exact parent revision. changes contains exact linked personId, their own current original sourceUrl, attendanceStatus and label/start/end only. EVERY NEW participant requires BOTH start and end, using explicit {inherit:true} for each inherited boundary; omitted endpoints reject the entire patch with new_participation_window_required. Existing participant omissions preserve saved endpoints; omitted labels preserve existing values. Approximate late arrivals need both the nominal start endpoint and qualifying label. {anchor,offsetMinutes} performs elapsed arithmetic on timed event instants. The server preserves all event/building/unrelated-person facts using the map snapshot already returned by read_map_events, and uses already observed original/identity data. This tool never reads sources, Calendar, roster identities or task storage. No event creation or Calendar writes. No-ops, incomplete state and failures provide no completion proof. If participation_task_not_ready includes requiredTaskReads, complete those exact taskRef/fragment nextOffset chains before resubmitting, or root-read tasks without a listed fragment. Otherwise check selected task IDs/current read/saved targets; do not rewrite correct unchanged tasks. Resolve only after a matching applied receipt already returned in this run.
<!-- /prompt -->

## already-correct-tasks

<!-- prompt: already-correct-tasks -->
These requested attendance states are already correct. No change is needed; explicitly resolve their current task versions with outcome=no_change_needed and reason=already_correct before finishing. This is a review result, not an applied write.
<!-- /prompt -->

## endpoint

<!-- prompt: endpoint -->
Exactly one representation: {at: RFC3339 timestamp}, {anchor: event_start or event_end, offsetMinutes: elapsed minutes}, or {inherit:true}. EVERY NEW participant requires BOTH start and end, including explicit {inherit:true} for an inherited boundary. Omission preserves an existing participant override. Explicit inherit stores null. Approximate late arrival needs a supported start endpoint AND qualifying label; a label alone does not set time. Relative anchors require a timed event.
<!-- /prompt -->

## label

<!-- prompt: label -->
Preserve meaningful activity and approximate timing wording. A timing label does not set start/end; supply the supported changed endpoint too.
<!-- /prompt -->
