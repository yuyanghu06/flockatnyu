# Current database tables

Hosted Supabase retains seven public tables through migration024. All force RLS and deny direct browser access; backend credentials and source policy remain server-only.

| Table | Purpose |
| --- | --- |
| `discord_view_policies` | One row per Discord server: channel/thread catalogue in `channels` JSONB, stable source UUIDs, view/exclusion policy and metadata discovery checkpoints. No message bodies. |
| `miro_boards` | One row per board: original objects, text, layout and relationships in `data` JSONB, plus source/configuration, freshness and sync lease controls. |
| `knowledge_sources` | Shared registry for Miro and other non-Discord sources. Discord identities live in the Discord catalogue instead. |
| `agent_input_cache` | Temporary shared input buffer with exactly `uuid` and `raw_response` JSONB. The authorized Gmail receiver enqueues email provider payloads here. |
| `agent_automation_state` | Metadata-only queue identities, leases, cooldown/action receipts and Gmail watch/history checkpoints. No source bodies. |
| `map_buildings` | Nine stable selectable map locations; name/aliases, validated `people_here` reports/plans and flattened `scheduled_events` arrays. |
| `map_people` | Twenty-six avatar-backed person identities; display/first/last names, optional Discord ID/display name/email, avatar URL and trackable flag. Identity roster, not source membership. |

There are no per-person membership tables. Trusted backend source allowlists and administrator checks still apply. Shared database access does not grant a collector arbitrary source scope.

Assistant Discord reads and generated summaries exist only in request memory. Native new/edit/delete events can remain in the temporary shared input queue until explicitly handled. The separate `discord-events` collector enforces inherited channel/category blacklists; its metadata refresh replaces the old daily cron. Historical content/summary/vector/accounting/job tables remain removed.020 preserves manual disables in existing catalogue JSONB without adding tables or columns.

Cache cleanup requires explicit successfully handled snapshot IDs from the trusted handler. An active Gmail receiver does not itself run an LLM or remove successfully received input as processed. The LLM service and concrete map/Calendar write adapters are inactive. See [automation](agent-automation.md) for the processing contract.

Migrations018/019 and service-only permissions have hosted verification recorded in the [milestone snapshot](../milestones/milestone.md). Applied migrations remain immutable; consult [migration guidance](../supabase/migrations/info.md). Current source behavior is documented in [live-only Discord](discord-live-only.md), [Google](google-connector.md) and [Miro](miro-sync.md).

## Map roster and presence contracts

Migration021 is hosted as20261017194715_map_people_buildings. Person IDs are deterministic for the26 initial avatar filenames; rerunning seed inserts preserves enriched/manual values. Unknown surnames remain nullable. All26Discord identities are linked:15initial name matches plus11explicit user-confirmed names/handles, each checked against configured-guild member profiles. A fresh audit found25Eboard-role accounts and one user-approved senior-advisor exception. Original15links were preserved. Names are matching evidence, not physical presence. No email addresses or locations were invented.

The five new invoker functions are service-only. `map_set_person_location(uuid,text,jsonb)` validates references and updates presence atomically under map-specific locks; `map_get_buildings(timestamptz)` suppresses expired/future entries. Current JSON entries have person_id, status(self_reported/planned), valid_from, expires_at, source_id, source_url and label (added by023). One entry/person/building is allowed. Moves replace prior self-reports while preserving independent plans at other buildings and unrelated people. Delete/disable is rejected while building references remain. These functions do not grant source access: future backend APIs must recheck provenance against current source policy. No frontend or agent map-write tool is wired by table creation. Initial presence arrays were empty. A later user-authorized UI fixture adds five planned debug entries at Bobst with a24-hour expiry; these are labeled Test in the local frontend and do not establish actual physical presence. The read-only /api/map/presence endpoint keeps service credentials server-side and returns only names, portrait paths, status and timing. Ordinary source entries remain hidden until a current-policy authorization callback is connected.

Migration022 is hosted as20261017202855_map_buildings_people_here_only. Runtime credentials retain SELECT and UPDATE(people_here) only on map_buildings: no building insert/delete or direct ID/name/alias/updated_at edits. Existing presence RPCs remain invokers; their validation trigger maintains updated_at internally. All existing data and function definitions are preserved. No map-write agent tools are exposed.

Migration023 is hosted as20261017203512_map_presence_labels. Each presence entry requires label (string,0–200 Unicode code points). Backfill preserves prior fields/order/validity times, adding blank labels; five existing Bobst fixtures explicitly store Test. The API passes labels unchanged and the frontend displays them directly; no isDebug flag or source/status-derived caption. Fixed catalogue permissions from022 are unchanged.

## Building scheduled event array (024)

Migration024 is hosted as20261018000104_map_building_scheduled_events.
map_buildings.scheduled_events is JSONB NOT NULL DEFAULT '[]', capped at200flat
objects per building, with unique event IDs within that building. Required fields:
id,title,starts_at,ends_at,time_zone,all_day,status,source_id,source_url. Optional
fields:description,location,url. All fields are strings except all_day(boolean);
nested/unknown fields are rejected. Status is confirmed,tentative or cancelled.
Times must be finite ISO timestamps with a timezone and end after start; time_zone
must be a PostgreSQL timezone. Source identity is UUID and links use HTTPS.

The column is owner-controlled: service_role can read it but retains only
UPDATE(people_here) on map_buildings. Browser roles have no access. Existing
building/person rows, functions, table ACLs and forced RLS were verified unchanged
in the apply transaction. All nine arrays initialize empty. The read-only map API
filters source policy, cancellation and expired end times before returning safe
event presentation fields. No event-population worker is wired. See
evidence/map-building-activity/migration-receipt.json and hosted-verification.json.

The update-agent runtime prompt shares machine-readable contracts for existing people_here/scheduled_events with synthetic examples and semantic rules in server/map/contracts.js. It uses the actual scheduled_events name; no events_here alias/second array is introduced. Operator-approved two-hour defaults determine proposed explicit expiry/end values, not automatic JSON database defaults. No schema/data/grant changes follow from prompt wiring.

## Event attendee UUID arrays (025)

Hosted20261018001815 extends existing scheduled_events validation with optional attendee_ids: an array of up to500unique canonical map_people UUID strings; unknown/duplicate/invalid IDs are rejected. Legacy events can omit it. Backend resolves only trackable safe names/portraits after authorizing the event source; unavailable/deleted identities are omitted at read time. No new table or event-write permission. Bobst UI fixtures now contain explicit sample attendees; people_here is unchanged.
