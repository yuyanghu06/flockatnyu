# Logical commit publication preflight

- Local timestamp / acting role / milestone: 2026-10-17T20:36:15.139378-04:00 / side-conversation direct / requested Git publication.
- Requested scope: split the entire working tree into multiple logical commits and push all changes.
- Starting repository state: codex/dev at bc7847b, aligned with origin/codex/dev after fetch.4647status entries including540old asset deletions/moves and3183evidence files; live changed files~418.5MiB. Existing unrelated authored changes explicitly included by user; ignored credentials/config/cache files excluded.
- Work performed / changed files: used index-only relocation/feature staging in mixed main/config files to separate assets, Calendar, map schemas/read API, automation, loading branding, selection indicators and avatar/event/assistant UI. Preserved complete working files. Evidence split into branding and map verification commits. No commit rewriting, force push, deployment, live data or source integration mutations. One later evidence staging attempt hit an active index lock while prior large git-add still ran; waited for it to finish and retried normally, never deleted a live lock.
- Decisions: include all intentionally retained QA frames and rejected design references per user request; no history pruning. Keep environment credentials, OAuth output, local MCP settings, build/dependency caches ignored. Existing branch/remote retained.
- Checks and evidence: scanned4107changed live files/557text files against configured secret values and common private-key/provider/GitHub/Google/Supabase secret patterns:0findings;0tracked credential files;0files over95MiB. git diff --check clean. Full56file Node run707passes and one assistant test-file import failure; repaired PNG/SVG imports to Vite-compatible new URL expressions and added generic classList support to fake DOM; affected assistant tests7/7pass, totaling714passing test cases across the run plus focused retest. API/frontend builds pass (known large chunk warning). Four additional map/startup scripts pass (5memory,16presentation,9startup,12visual assertions). Actual isolated Chrome confirms URL-based logos load, hover pixels animate, pointer leave restores identical PNG. Source fix only in assistant.js and assistant test DOM; no unrelated implementation change.
- Resulting state / acceptance:10logical implementation/evidence commits prepared; remaining shared docs/history are being committed next. Publication not yet claimed. No independent agents used under side-conversation constraint.
- Remaining work and handoff: commit remaining documentation/journal, push normally, verify remote SHA and clean tree, append verified publication receipt and push it too.

Prepared commits:

8e83ca2 refactor(assets): consolidate campus models and portraits under assets
24c4c55 chore(assets): update export tooling and model documentation paths
4e6ce09 feat(calendar): add scoped event tools and optional Google consent
356a86b feat(map): add validated people, presence, events and attendee storage
3f0445a feat(automation): add bounded Calendar adapters and structured map policies
55b0a11 feat(branding): add raised pastel loading animation and favicon
b4f7f4b feat(map): animate persistent outlines and footprint selection rings
e2fcc56 feat(ui): add campus avatars, event cards and animated assistant branding
f6d143e test(branding): preserve loader, favicon and reveal verification evidence
11e87a4 test(map): preserve interaction, schema and event UI verification evidence
