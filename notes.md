# User notes and ideas

Persist user-requested notes here across sessions. Preserve the user’s intent, date meaningful additions, and distinguish an idea from approved implementation. When a note changes, mark it superseded with the replacement rather than silently erasing it. Current implementation and verification belong in milestones/milestone.md; service boundaries belong in docs/architecture.md.

## 2026-10-17

- **Calendar:** use Tech’s **fall26** calendar for the calendar integration. Resolve its exact Google Calendar ID when wiring the tools; no calendar ID is recorded yet.
- **MVP first:** finish the initial MVP using the agreed architecture, then expand later.
- **Frontend:** substantial frontend changes are planned. Keep backend contracts and ownership clear so frontend work can proceed independently.
- **Shared agent tools:** Chat API and Automation Worker should share tool implementations. The target is the same tool catalog with different prompting; exact tool exposure and wiring are a later discussion.
- **Architecture:** keep one repository with independently deployable source collectors, Chat API and Automation Worker, sharing Supabase with explicit data ownership.
