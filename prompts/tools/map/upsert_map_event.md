# upsert map event

## description

<!-- prompt: description -->
Atomically create or update ONE normalized event and its complete building/people relationships. First read and merge existing state. For existing records send event.id inside event and expectedUpdatedAt as a TOP-LEVEL sibling of event/buildings/people, copied from the parent event.updated_at; omit token for creation. Stable source_record_id prevents duplicates. Every participant displays at every linked building; overlaps allowed. No profile/building creation or cross-event removal. Conflicts require reread, never a new identity.
<!-- /prompt -->

## expectedupdatedat.description

<!-- prompt: expectedupdatedat.description -->
For updates, put this at the TOP LEVEL beside event, buildings and people. Copy the parent event.updated_at exactly. Never put expectedUpdatedAt inside event.
<!-- /prompt -->
