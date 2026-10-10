# Current milestone and session handoff

## Product goal

Interactive NYU Manhattan campus map for club activity and resources. Calendar,
Discord summaries, Drive retrieval, and a conversational assistant remain future scope.

## Current status

**M0 managed agent workflow: complete** as the previously verified configuration
and documentation scaffold. Native named-role discovery/execution remains a runtime
follow-up; no global trust or MCP settings were changed.

**M1 map implementation: in progress (2026-10-10).** Paulson Center identified (user-confirmed), extracted and placement derived; the map application itself is not yet built. See [extraction pass](history/2026-10-10_19-26-30-710664-orchestrator-paulson-extraction-and-push.md).

Earlier note: M1 was previously deferred to another assistant at the user's request.
The user withdrew this session's implementation request and instead requested a
Markdown implementation prompt. That handoff document is complete:
[initial map prompt](../docs/initial-map-prompt.md).

## Implemented state and boundaries

- Existing .codex/ project workflow and five role configs, templates, asset export,
  and append-only tracking remain preserved.
- Actual read-only planner inspected exported assets and reference map code before
  the implementation request was cancelled. Its partial report was journaled.
- The prompt requests a local Washington Square map, close initial view, freely
  adjustable orbit/pan/zoom, reset, and camera export/restore for user angle feedback.
- Additional input is `/Users/yuyang/Downloads/scene.glb`, a neighborhood scene from
  which the receiving assistant must identify/extract/align the missing center.
  Spoken name “Halcyon Center” may refer to John A. Paulson Center; identity is
  unresolved pending the user clarification and must not be guessed.
- No application source, package/build setup, Git repository, dev server, extraction,
  deployment, integrations, database, scheduler, or member assistant exists.
- Proposed local stack is Vite, vanilla JavaScript and Three.js. It is a suggestion,
  not an installed project implementation. Source site remains read-only reference.
- Keep export coordinate/placement metadata authoritative; roads and traffic remain
  excluded. New GLB alignment requires its own documented transform.

## Verification and limitations

Prior M0 schema/document/config checks remain recorded in prior immutable history.
This pass inspected workspace and Git absence, asset documentation and role configs.
Planner reports 32 tiles in a 600m tile-center radius (~1.35 MB), Meshopt requirements,
landmark transforms, baked geometry and reference palette; no visual acceptance yet.

Additional GLB header inspection found 389,960 bytes, valid GLB v2, 151 nodes,
150 meshes, 50 materials, sampled unnamed nodes and no required extensions. This
establishes file structure only; target building identity/geometry is unverified.
Temporary Playwright tooling under /tmp launched installed Chrome successfully;
no application/browser/build checks apply because implementation was cancelled.
Handoff document links and required scope were checked locally.

## Latest passes and next action

Partial [planner inspection](history/2026-10-09_19-22-14-097821-planner-partial-campus-inspection.md); latest
[orchestrator handoff](history/2026-10-09_19-22-14-098662-orchestrator-write-initial-map-prompt.md). The orchestrator owns documentation;
planner performed no edits and no native project role discovery was claimed.

Give `docs/initial-map-prompt.md` to the receiving assistant. Confirm the center's
identity, then implement/extract/test according to the prompt. No further map
implementation is authorized for this session after the user's cancellation.

Latest verification: [prompt handoff checks](history/2026-10-09_19-22-35-721275-orchestrator-verify-prompt-handoff.md) — seven documents, ten local links and required scope pass; no app or Git initialized.
