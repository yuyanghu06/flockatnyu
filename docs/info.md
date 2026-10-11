# Project documentation

`agent-workflow.md` explains orchestration, role ownership, iteration, and handoff.
`templates/` holds the reusable assignment, report, and history formats. Current
state and unfinished tasks belong in `milestones/`; avoid duplicating that state
in new design documents. The orchestrator owns shared workflow edits.

`initial-map-prompt.md` is the user's requested handoff prompt for another assistant
to build the first local Washington Square map with free camera controls and
extract the missing center from `/Users/yuyang/Downloads/scene.glb`. It is an
implementation request, not evidence of implemented application behavior.

`paulson-reference.md` records the architect photos actually inspected, geometry
contract, source credits, and approximation limits for the runtime Paulson model.

M3 references: silver-towers-reference.md, leslie-elab-reference.md, gould-plaza-reference.md. color-schemes.html is a separately built interactive proposal page; color-schemes.md records brand provenance, tokens and contrast.

M4 reference guides: kimmel-reference.md and silver-center-reference.md document corrected building identities, photographic provenance and preserved source geometry. Silver Towers notes now describe a superseded runtime model.

M5: courant-stern-detailing.md records window enhancement and exact existing-color preservation contracts.

M6: streets-parks-data.md records OSM snapshot/projection; streets-rendering.md and parks-rendering.md explain surface generation, layering and limits.

Global Center references and fidelity limitations: global-center-reference.md.

Map-only controls, camera mapping and appearance settings: map-presentation.md; glow provenance: hover-reference.md.

Camera navigation research and input contracts: camera-navigation.md. Park planting eligibility, exclusions and bake audit: park-vegetation.md.

M11: map-presentation.md describes analytic sky/fog and screenshot-guided reset; camera-navigation.md records saved-overview exit and wheel routing; union-square-context.md records source geometry restoration and pale materials.

M12: map-performance.md documents resource ownership; map-performance-research.md records sources, zoom investigation and live verification limits.

M13 loading-screen.md explains actual readiness, explicit entry, errors and verification limits.

M14: supabase-mcp-setup.md records normal local setup attempt, Windows config-write denial and OAuth next steps; connection inventory is in AGENTS.md. backend-direction.md records assistant-first architecture decisions.

- assistant-backend.md records the incomplete M15 source, setup boundaries, checks and open findings.
