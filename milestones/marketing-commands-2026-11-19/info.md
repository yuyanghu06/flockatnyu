# Marketing event commands (2026-11-19)

**Goal:** events-team, marketing and leadership members pick an upcoming club
Google Calendar event in Discord to view its marketing details (Stage 1) and to
submit them (Stage 2). Ported from the standalone marketing reminder bot on
branch `port-marketing-bot` (`port-source/`).

**Scope, staged with user review after each stage:**
- Stage 0: read-only confirmed upcoming Calendar reader and print script. Done, committed as 7e855bc.
- Stage 1: Gateway interaction dispatcher, `/event-info`, migration 057, role/channel gate, single-command registration. Reviewed; threads inside the allowed channels added; committed locally (3835182, 77563e9, dc86017, 947c72a), not pushed.
- Stage 2: `/event-details` core and extras modals, atomic merge (migration 058), ephemeral confirmation. Implemented locally, awaiting review.
- Out of scope for now: summary card, reminders, sweep, asset attachment.

**User decisions:** reuse the existing Tech@NYU Calendar OAuth client and the
club calendar (`GOOGLE_CALENDAR_ID`), 60-day window, Calendar read inside
`discord-events`. Allowed roles: events leads 1203562091517321226, marketing
1203562091517321229, leadership 1203562091517321230. Allowed channels:
#events-team 1203562092213305370, #marketing-and-content-team 1203562092213305366.

**Rules:** node:test; migrations are written only, never applied; never read
`.env` files or credentials; never bulk-replace Discord commands.

**Completion:** all three stages implemented and reviewed, migrations applied by
the user, commands registered and verified live in Discord.

**Status:** Stage 2 implemented locally and awaiting user review. Nothing deployed, applied or registered.
