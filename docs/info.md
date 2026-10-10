# Project documentation

`agent-workflow.md` explains orchestration, role ownership, iteration, and handoff.
`templates/` holds the reusable assignment, report, and history formats. Current
state and unfinished tasks belong in `milestones/`; avoid duplicating that state
in new design documents. The orchestrator owns shared workflow edits.

`initial-map-prompt.md` is the user's requested handoff prompt for another assistant
to build the first local Washington Square map with free camera controls and
extract the missing center from `/Users/yuyang/Downloads/scene.glb`. It is an
implementation request, not evidence of implemented application behavior.
