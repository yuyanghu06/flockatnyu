# Performance research and application — 2026-10-11

X/Twitter searches for Three.js, OpenSA and optimization did not yield verifiable technical posts. Direct Bruno Simon and Dan Greenheck post retrieval failed in this session. No X post content or viral performance claims are treated as verified evidence.

Primary technical sources:

- [AE1 developer optimization notes](https://github.com/iniGlowee/threejs-game-optimization): static local matrices and targeted picking are relevant to this largely static scene. Applied local matrix freezing with movable landmark roots, cached picking candidates and a reused hit array. Its reported performance numbers are not this project's results. BVH, texture compression and lower resolution are not adopted without a demonstrated need.
- [OpenSA creator's engine writeup](https://github.com/AlexSergey/my-blog/blob/main/opensa/3-an-aaa-engine-for-gta-san-andreas-in-the-browser-and-rewriting-threejs.md): distinguishes CPU submission from GPU frame cost and measures dense camera routes. Applied bounded frame interval and CPU timing diagnostics, not an engine migration. The [repository](https://github.com/AlexSergey/opensa) describes an unofficial asset-compatible engine and says the project closed in August 2026; it is not evidence of an available official GTA browser port.
- [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html): renderer.info supplies geometry/texture counts and rendering statistics. These are exposed separately from offline backing-buffer bytes; counts do not measure GPU bytes.

## Zoom-out investigation

Prior numerical camera tests cover return trajectory and preservation of wheel deltas. Remaining live unsmoothness cannot be diagnosed conclusively without browser traces. Source inspection found repeated full-scene intersection work on pointer/wheel events, per-frame static local matrix composition and eager duplicated hover buffers. This pass reduces that work without changing the camera spring, zoom bounds, geometry detail, render resolution, sky or vegetation.

`window.__map.performance()` returns rolling 300-frame interval and main-thread frame p50/p95/p99 plus renderer resource counts. Main-thread time includes rendering submission, not asynchronous GPU execution. Hidden-tab pauses and initial loading may affect intervals. For future comparison, refresh, finish loading, run the same zoom-out path, then capture diagnostics in the browser; no live results were collected here because access remains denied.

## Hover brightness and tradeoff

All buildings previously shared the same additive overlay opacity. Source does not establish a special Bobst brightness mechanism. Mesh overlap, underlying color and visible surface count can affect additive appearance; no geometry was removed based on that hypothesis. Bobst retains .18 + .12*wave; others use .14 + .08*wave (25% lower mean target opacity). All hovered buildings, including selected ones, ease to a 4.5m lift, except reduced-motion mode.

Active overlays share original geometry and never dispose it. Idle overlays retain zero geometry buffers. This trades the previous single merged hover draw for one draw per source mesh while hovered; Paulson has eight. Browser profiling must confirm that tradeoff. Buildings retain all original triangles and material colors.
