# Project root guide

Model instruction wording is maintained in [prompts/](prompts/info.md); server modules assemble named Markdown blocks and runtime values through one loader.

The user-authorized October25 planner queue clear removed the old inputs and saved follow-up work, restarted the existing worker and verified empty work queues. New ingestion remains enabled; see [the operation guide](milestones/planner-48h-review-2026-10-25/info.md#authorized-queue-clear-follow-up).

The October25 planner48-hour operational review is documented in [its milestone guide](milestones/planner-48h-review-2026-10-25/info.md); current service availability, task-save failures, queue caveats and independent verification belong to the rolling snapshot. This review changed documentation only.

This Git checkout is the application root. `src/` and `index.html` supply the Vite/Three.js campus interface; `server/` contains the Hono assistant API and independent source workers. `package.json` provides local paired web/API startup, separate sessions, builds and focused checks. Runtime keys belong in ignored settings or service secrets.

`contacts-mock.html` is an isolated local Contacts design draft served by Vite. Its copied UI, synthetic in-memory data and styles live in `src/features/contacts/contacts-mock.js` and `src/features/contacts/contacts-mock.css`. It replaces the cancelled calendar draft, makes no real API calls and is deliberately absent from production build inputs.

`README.md` is the entry point. `AGENTS.md` defines scope and development rules; `.codex/` holds tracked agent configuration. `docs/` describes current contracts and source references. `milestones/` owns the rolling state, to-do list and immutable pass history. The orchestrator serializes shared journal updates and assigns exclusive writer ownership.

`deployment/` contains independent Discord/Gmail event collector and Miro worker images. Railway production has exactly `discord-events` and `gmail-events` running continuously, plus paused `miro-sync`. All share Supabase. The Discord discovery cron is removed. Native Discord creates and Gmail ingestion have reached the pending queue; edit/delete lifecycle and live blacklist probes remain follow-up. No LLM service or Calendar/map write adapters are active. `supabase/` preserves immutable migrations and the five service-only tables; the rolling milestone records exact deployment evidence.

`admin.html` supplies guarded Discord channel administration. Discord message content is read live through the bot, with bounded request-memory summaries and no stored fallback. Google tools are read-only; Gmail buffering does not itself run the agent. Miro tools preserve explicit source scope and coverage limits. Their implementation guides live under `server/` and `docs/`.

`assets/` is the common home for retained assets; see its [guide](assets/info.md). `assets/yuyang-site-3d-assets/` is the reusable source export with its README/manifest. `assets/campus-assets/` contains the extracted Paulson model and placement metadata. Generated portraits live in `assets/avatars/`; reference text lives in `assets/references/`. Preserve source geometry, coordinate boundaries and licenses. Selectable facade/rooftop details stay merged with their building root. `tools/` holds callable assistant tools by capability; `scripts/` holds extraction/build/deployment utilities; `tests/` and `evidence/` separate checks from recorded observations. Dependencies, generated output, secrets and caches are excluded by `.gitignore`.

`notes.md` stores user-requested persistent ideas/preferences; AGENTS.md requires reading it at startup and updating it when the user asks to save a note. It does not replace architecture or implementation records.

The startup overlay uses static SVG contour masks over two composited rotating color surfaces, with the approved static SVG for reduced motion/fallback. Critical loading styles/error fallback live in index.html; src/app/startup-visual.js owns the1100ms logo exit and1000ms white dissolve while src/app/map-startup.js retains actual readiness/retry. Courant/Stern work yields cooperatively before registration. SVG/GIF/MP4 exports are previews; rounded-square static SVG/ICO favicons are independent. See docs/loading-screen.md.

The approved raised pastel finish is a static transparent SVG shadow/bevel/sheen image above those moving colors. The matching static favicon embeds that relief at 80% of the original mark size inside its rounded white badge. See scripts/build-brand-relief.mjs and scripts/build-brand-favicon.mjs.

Building interaction uses a steady white surface highlight with smooth fades. Selection preserves the same overlay through camera/pointer changes; pulsing color, hover lift and the cancelled outline experiment are inactive. See docs/hover-reference.md and src/map/landmarks/landmark-effects.js.

Vite emits stable root favicon.svg/favicon.ico from the approved assets/branding
sources for the public login page. These two read-only branding files are the
only added anonymous static routes; application assets and APIs stay gated.

Developer Supabase MCP is verified on the current Mac through the project-restricted read-only endpoint and browser OAuth. See docs/supabase-mcp-setup.md; application service credentials remain separate.

Railway CLI is installed and signed in on the current Mac; this checkout links to tech-nyu production with no default service. See docs/deployment.md for local CLI guidance.

AGENTS.md now requires isolated service tools and prompt-defined multi-tool workflows; recording that rule does not establish a runtime refactor or deployment.

October25 Go Greek retirement: live website removal is verified on web408f84bb; database cleanup046 is prepared/tested but awaits project-scoped MCP write authorization. Preserve the separate Kimmel event. See milestones/go-greek-removal-2026-10-25/info.md for exact status.

The approved Contacts prototype has been promoted to the real API-backed website UI and deployed on web release `a3bc66fa-2911-449b-ba38-3cb6fb71db98`. The mock remains a local design reference; synthetic data is not shipped. See milestones/contacts-site-release/info.md and the rolling snapshot for actual verification and mutation limits.

The separate opt-in Gmail sender-cache enrichment worker is documented in docs/gmail-enrichment.md. Its own runtime/package reads contacts_cache unchanged and inserts native raw Contacts with separate metadata-only completion, lease/version and budget checks. Implementation, migration and activation status are in the rolling milestone.

Current source layout: `src/app` composes the browser, `src/features` holds assistant/Contacts/admin interfaces, `src/map` holds scene responsibilities, and `src/api` holds server-only provider-grouped HTTP handlers. `config/file-limits.json`, `.github` and `.githooks` implement the quality/release policy in `docs/ci-cd.md`.
