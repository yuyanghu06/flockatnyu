# White hover-outline plan

- Local timestamp / acting role / milestone: 2026-10-17T17:08:19.185343-04:00; planner; M46.
- Requested scope: white perimeter interaction, removed on selection; no floating marker.
- Starting state: pulsing additive hovered-surface glow and lift, including selected hover. Broad unrelated work preserved.
- Work performed / decisions / ownership: User requests a white Cities: Skylines-style perimeter replacing current pulsing surface glow, disappearing on selection. A proposed floating marker was explicitly cancelled. Read-only planner recommends a hover-only GPU union silhouette pass with complete building geometry, approximately1.5–2 CSS-pixel white stroke, unchanged beauty shading, actual-depth occlusion and no CPU readback. Active state is hovered and not selected. Selection removes outline and grounds the whole root before focus; reduced motion keeps a steady outline and disables lift. Existing geometry, materials, instances, raycasts, camera, avatars, loader and favicon remain independent.

Primary inspected current hover effects, render loop, Three.js local renderer/postprocessing sources and presence masks. Coder exclusively owns effects/optional outline helper, minimal main-loop hook and scoped interaction guides. Tester owns affected effect assertions and m46 evidence. Proposed integration renders a selected-only mask, then draws a transparent white edge with per-fragment selected depth against the unchanged main framebuffer. No EffectComposer, beauty-color target, new pin, full-scene depth rerender or geometry regeneration is planned. Browser acceptance must demonstrate perimeter quality, selected suppression, occlusion, DPR/resize, unchanged colors/geometry and bounded hover cost.
- Checks and evidence: read-only source inspection; no execution or visual acceptance claimed.
- Resulting state: bounded implementation assigned; user request supersedes glow instructions in interactive-landmark-zoom skill.
- Remaining work: implement, independently exercise and review actual browser output.
