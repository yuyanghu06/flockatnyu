# Project root guide

This Git checkout is the application root. `src/` and `index.html` supply the Vite/Three.js campus interface; `server/` contains the Hono assistant API and independent source workers. `package.json` provides local paired web/API startup, separate sessions, builds and focused checks. Runtime keys belong in ignored settings or service secrets.

`README.md` is the entry point. `AGENTS.md` defines scope and development rules; `.codex/` holds tracked agent configuration. `docs/` describes current contracts and source references. `milestones/` owns the rolling state, to-do list and immutable pass history. The orchestrator serializes shared journal updates and assigns exclusive writer ownership.

`deployment/` contains independent Discord/Gmail event collector and Miro worker images. Railway production has exactly `discord-events` and `gmail-events` running continuously, plus paused `miro-sync`. All share Supabase. The Discord discovery cron is removed. Native Discord creates and Gmail ingestion have reached the pending queue; edit/delete lifecycle and live blacklist probes remain follow-up. No LLM service or Calendar/map write adapters are active. `supabase/` preserves immutable migrations and the five service-only tables; the rolling milestone records exact deployment evidence.

`admin.html` supplies guarded Discord channel administration. Discord message content is read live through the bot, with bounded request-memory summaries and no stored fallback. Google tools are read-only; Gmail buffering does not itself run the agent. Miro tools preserve explicit source scope and coverage limits. Their implementation guides live under `server/` and `docs/`.

`yuyang-site-3d-assets/` is the reusable source export with its README/manifest. `campus-assets/` contains the extracted Paulson model and placement metadata. Preserve source geometry, coordinate boundaries and licenses. Selectable facade/rooftop details stay merged with their building root. `tools/` holds callable assistant tools by capability; `scripts/` holds extraction/build/deployment utilities; `tests/` and `evidence/` separate checks from recorded observations. Dependencies, generated output, secrets and caches are excluded by `.gitignore`.

`notes.md` stores user-requested persistent ideas/preferences; AGENTS.md requires reading it at startup and updating it when the user asks to save a note. It does not replace architecture or implementation records.
