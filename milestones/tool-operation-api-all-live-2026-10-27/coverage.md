# Per-operation live coverage — October 27, 2026

**45/54 names** have successful model-selected calls through the private API to real providers/stores. All 54 have separate offline transport coverage. This does not mean every possible workflow passed.

The one production cycle was explicitly approved. The user declined two additional create/cancel test cycles, so the remaining worker calls stay unverified. Automatic sync returned partial and is not counted as a successful model-selected call.

| Operation | Live result | Evidence group |
| --- | --- | --- |
| `search_attio_records` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `read_attio_record` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `list_attio_attributes` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `create_attio_record` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `update_attio_record` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `send_gmail` | Live model-selected call succeeded | Root live and completed map/email verification |
| `list_discord_channels` | Live model-selected call succeeded | Root live and completed map/email verification |
| `search_discord` | Live model-selected call succeeded | Root live and completed map/email verification |
| `read_discord_messages` | Live model-selected call succeeded | Root live and completed map/email verification |
| `read_discord_window` | Live model-selected call succeeded | Root live and completed map/email verification |
| `read_discord_summary` | Live model-selected call succeeded | Root live and completed map/email verification |
| `draft_discord_message` | Live model-selected call succeeded | Root live and completed map/email verification |
| `list_calendar_events` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `read_calendar_event` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `create_calendar_event` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `update_calendar_event` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `delete_calendar_event` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `create_calendar_events` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `update_calendar_events` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `upsert_calendar_event` | No successful live call; further worker cycles declined | Held worker workflow |
| `cancel_calendar_event` | No successful live call; further worker cycles declined | Held worker workflow |
| `read_memory` | Live model-selected call succeeded | Root live and completed map/email verification |
| `update_memory` | Live model-selected call succeeded | Root live and completed map/email verification |
| `search_gmail` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `read_gmail` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `search_drive` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `read_drive` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `list_drive_folder` | Live model-selected call succeeded | Google live and Calendar recovery reports |
| `search_contacts` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `read_contact` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `import_treg_contacts` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `create_contact` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `update_contact` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `delete_contact` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `list_miro_boards` | Live model-selected call succeeded | Root live and completed map/email verification |
| `read_miro_board` | Live model-selected call succeeded | Root live and completed map/email verification |
| `read_miro_item` | Live model-selected call succeeded | Root live and completed map/email verification |
| `read_map_events` | Live model-selected call succeeded | Root live and completed map/email verification |
| `lookup_map_person` | Live model-selected call succeeded | Root live and completed map/email verification |
| `upsert_map_event` | Live model-selected call succeeded | Root live and completed map/email verification |
| `search_treg_people` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `enrich_treg_people` | Live model-selected call succeeded | CRM live and completed workflow reports |
| `bug_reports` | Live model-selected call succeeded | Root live and completed map/email verification |
| `list_member_plans` | No successful live call; further worker cycles declined | Held worker workflow |
| `read_member_plan` | No successful live call; further worker cycles declined | Held worker workflow |
| `upsert_member_plan` | No successful live call; further worker cycles declined | Held worker workflow |
| `cancel_member_plan` | No successful live call; further worker cycles declined | Held worker workflow |
| `patch_map_participation` | No successful live call; further worker cycles declined | Held worker workflow |
| `sync_calendars_to_map` | Automatic live call returned partial; model selection unverified | Held worker workflow |
| `defer_task` | No successful live call; further worker cycles declined | Held worker workflow |
| `read_pending_task` | Live model-selected call succeeded | One production-cycle report |
| `resolve_pending_task` | Live model-selected call succeeded | One production-cycle report |
| `read_context_fragment` | Live model-selected call succeeded | One production-cycle report |
| `finish_batch` | Live model-selected call succeeded | One production-cycle report |

Miro item reads can return bounded partial content; this counts as a successful bounded read, not complete-board coverage. Treg enrichment processed a no-match; positive profile matching remains unverified. Shared memory save used unchanged content. Read-only/draft calls did not send Discord messages.

Detailed group evidence and workflow qualifications are in [verification.md](verification.md) and the manually editable [common task log](../../docs/agent-tasks.md).

A subsequent [location repair](../calendar-sync-location-fix-2026-10-27/verification.md)
fixes the reproducible E-Lab mismatch and false partial status for unmatched
places. Offline and read-only diagnostics pass; no additional production cycle
or live map write was run. The original sync row and 45/54 live count remain
unchanged historical evidence.
