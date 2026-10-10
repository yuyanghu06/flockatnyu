# Consolidate project root

- Local timestamp / acting role / milestone: 2026-10-09T19:17:14.466620-04:00 / orchestrator / repository organization following M0.
- Requested scope: Move all repository files and folders into `tech-visualized/`.
- Starting repository state: Documentation, role configuration and assets were in the parent workspace; the destination held only an application-placeholder guide. No Git repository or application existed.
- Work performed / changed files: Moved `.codex/`, `.gitignore`, AGENTS.md, README.md, docs/, milestones/, the exported asset directory and ZIP into the destination. Merged the parent and placeholder folder guides. Updated active project-root references in instructions, README, guides, milestone and to-do documents. Added this immutable history entry.
- Decisions: `tech-visualized/` is now the full project root; future application source belongs here. Parent is a container. Prior history remains immutable. No Git initialization, application implementation, global configuration, MCP, trust or source-site changes.
- Checks and evidence: SHA-256 comparison verified all 535 moved files before documentation edits. Final verification checks original inventory, unchanged file hashes, local active-document links, six TOML files, asset ZIP integrity, and parent contents. Results appended after execution below.
- Resulting state / acceptance: All project material is consolidated at `/Users/yuyang/techatnyu-internal-tooling/tech-visualized`; both guide responsibilities are retained in the root guide.
- Remaining work and handoff: Open future project sessions from the new root. Native named-role execution and requested map implementation remain pending. This bounded relocation was a direct orchestrator pass; verification was not independent.

Final verification passed: 529 unedited files retain their original SHA-256 hashes, original file inventory is preserved (two guides merged), 6 TOML files parse, 10 active local Markdown links resolve, asset ZIP integrity passes, and the parent contains only tech-visualized/.
