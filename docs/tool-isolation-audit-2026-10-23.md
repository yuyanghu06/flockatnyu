# Tool isolation audit — October 23, 2026

**11 of 43 distinct tool names violate the new isolated-tools rule in this checkout.** Chat has 32 registered names and the staged planner has 25, with 14 shared names counted once. Four chat names and nine planner names violate on at least one reachable path; two violating names are shared between those agent sets. The newer local candidate adds `patch_map_participation`, also violating, making **12 of 44** there.

This is a read-only source audit of root HEAD `fba416a` and the current separate managed testing worktree `/Users/yuyang/.codex/worktrees/agent-use-case-tests/flockatnyu`. It inventories all registered names, including tools gated by credentials, permissions or runtime configuration. It does not claim every tool is available in every request or that every deployed artifact matches either inspected tree. No runtime changes, deployment, inference or live business operations were performed.

## What counts

A tool violates when its named operation hides another service's content read/write, a separate model workflow, or business discovery/matching/sequencing that should be separate model-selected calls. Authentication/account verification, local permission/field checks, own-service pagination and exact-record version/preservation reads are not counted by themselves. Several internal API requests do not automatically mean several business operations. A named summary tool may summarize its own source; an original-message read silently switching into a summary is a violation.

## Violating tools

| Tool | Affected agent path | Hidden operations | Root source evidence |
| --- | --- | --- | --- |
| `read_map_events` | Chat and planner | Reads saved map data, then fetches Calendar/Discord/Gmail originals. | `server/map/events.js:219; server/map/source-access.js:72,83,105` |
| `lookup_map_person` | Planner only | Planner source checks fetch originals before the roster lookup. Configured chat lookup reads only saved map data. | `server/automation/adapters.js:629; server/map/events.js:216` |
| `upsert_map_event` | Planner; provider-backed chat writes | Fetches original provider records while validating the map write; worker also reads Calendar. | `server/map/events.js:271; server/automation/adapters.js:451,469` |
| `upsert_calendar_event` | Planner | Rereads Discord/Gmail originals; follow-up success automatically projects Calendar into map. | `server/automation/adapters.js:558,567,572,622` |
| `cancel_calendar_event` | Planner | Same source rereads and automatic Calendar-to-map projection. | `server/automation/adapters.js:558,567,572,622` |
| `upsert_member_plan` | Planner | Fetches Discord/Gmail, looks up a map person, writes Calendar and automatically projects into map. | `server/automation/adapters.js:398,478,507,519,521` |
| `cancel_member_plan` | Planner | Same bundled source/identity/Calendar/map workflow. | `server/automation/adapters.js:398,478,507,519,521` |
| `resolve_pending_task` | Planner | Reads Calendar or map/provider state while deleting a local saved task. | `server/automation/staged-pipeline.js:123,140; server/automation/adapters.js:656,684,697,701,711` |
| `finish_batch` | Planner initial phase | Triggers a hardcoded Calendar-to-map synchronization stage and opens follow-up. | `server/automation/handler.js:154,216; server/automation/staged-pipeline.js:167` |
| `read_discord_window` | Chat only | Large original-message reads silently start a separate model summarization pipeline. Worker returns the raw window. | `tools/discord/live-summary.js:45,55,78` |
| `create_calendar_events` | Chat | Scans Calendar, matches titles/times, chooses existing/skip/reject/create, then writes. | `tools/calendar/chat-batch.js:62,89,97` |

The candidate-only `patch_map_participation` performs an authorized map read, fetches Discord/Gmail originals, looks up map identities and reads Calendar before a map participation write. Candidate evidence: `server/automation/adapters.js:494,501,507,541,602,625,642`. It is not claimed deployed.

## Complete registered-name ledger

A violation label means at least one affected agent path above, not every call or every agent implementation with the same name. Clean means no violation identified in this bounded static audit.

| Tool | Chat | Planner | Result |
| --- | --- | --- | --- |
| `bug_reports` | Yes | — | No violation found |
| `cancel_calendar_event` | — | Yes | Violates |
| `cancel_member_plan` | — | Yes | Violates |
| `create_attio_record` | Yes | — | No violation found |
| `create_calendar_event` | Yes | — | No violation found |
| `create_calendar_events` | Yes | — | Violates |
| `defer_task` | — | Yes | No violation found |
| `delete_calendar_event` | Yes | — | No violation found |
| `draft_discord_message` | Yes | — | No violation found |
| `finish_batch` | — | Yes | Violates |
| `list_attio_attributes` | Yes | — | No violation found |
| `list_calendar_events` | Yes | Yes | No violation found |
| `list_discord_channels` | Yes | Yes | No violation found |
| `list_drive_folder` | Yes | Yes | No violation found |
| `list_member_plans` | — | Yes | No violation found |
| `list_miro_boards` | Yes | — | No violation found |
| `lookup_map_person` | Yes | Yes | Violates |
| `read_attio_record` | Yes | — | No violation found |
| `read_calendar_event` | Yes | Yes | No violation found |
| `read_context_fragment` | — | Yes | No violation found |
| `read_discord_messages` | Yes | Yes | No violation found |
| `read_discord_summary` | Yes | — | No violation found |
| `read_discord_window` | Yes | Yes | Violates |
| `read_drive` | Yes | Yes | No violation found |
| `read_gmail` | Yes | Yes | No violation found |
| `read_map_events` | Yes | Yes | Violates |
| `read_member_plan` | — | Yes | No violation found |
| `read_memory` | Yes | — | No violation found |
| `read_miro_board` | Yes | — | No violation found |
| `read_miro_item` | Yes | — | No violation found |
| `read_pending_task` | — | Yes | No violation found |
| `resolve_pending_task` | — | Yes | Violates |
| `search_attio_records` | Yes | — | No violation found |
| `search_discord` | Yes | Yes | No violation found |
| `search_drive` | Yes | Yes | No violation found |
| `search_gmail` | Yes | Yes | No violation found |
| `update_attio_record` | Yes | — | No violation found |
| `update_calendar_event` | Yes | — | No violation found |
| `update_calendar_events` | Yes | — | No violation found |
| `update_memory` | Yes | — | No violation found |
| `upsert_calendar_event` | — | Yes | Violates |
| `upsert_map_event` | Yes | Yes | Violates |
| `upsert_member_plan` | — | Yes | Violates |

## Important exclusions and other runner behavior

- Configured chat `lookup_map_person` is clean; planner's implementation of that same name is counted above.
- Worker `read_discord_window` is clean; chat's conditional nested-model branch is counted above.
- `update_calendar_events` reads exact caller-selected records to obtain revisions and preserve fields; it does not search for or select business targets. It is excluded from the count. `create_calendar_events` does semantic cross-record matching and choosing, so it is included.
- `read_discord_summary` explicitly names the summary operation and stays within Discord. Catalogue/window retrieval and summarization serving that named operation are not counted again.
- Google clients use Gmail profile/account endpoints for authentication, not mailbox-content retrieval. Miro authorization/quota storage is local metadata, not live Gmail or board content.
- Correction to broad earlier source descriptions: map authorization's Miro branch reads saved board-access metadata; it does not fetch live Miro originals. Confirmed hidden original fetches in map paths are Discord, Calendar and Gmail.
- The worker also runs its automatic Calendar-to-map stage when the initial model-round cap is reached, even without a `finish_batch` proposal (`server/automation/handler.js:173`). That is another runner path violating prompt-owned sequencing, but not an additional tool name.

## Verification and limits

Three independent read-only specialists covered map, worker wrappers and source-tool families. A final independent evaluation confirmed the Calendar batch distinction and reconciled the denominator. The orchestrator constructed tool catalogues locally with network fetch replaced by a throwing function: root chat32/planner25/union43, candidate chat32/planner26/union44. No factory execution dispatched network requests. Source families covered Discord, Gmail/Drive, Calendar, Member Plans, map, Miro, Attio, memory, bug reporting, saved-task/context tools and `finish_batch`. Retired/unregistered tool names were excluded.

This establishes reachable source-level violations, not observed frequency or the exact cause of a particular timeout. The separate candidate remains unmodified by this audit. Existing application behavior remains unchanged.
