# Eight building production chrome accepted

- Local timestamp / acting role / milestone: 2026-10-11T17:16:11.131085-04:00 / tester / M19.
- Requested scope: screenshot building camera views and screen-wide focused outward scrolling.
- Starting repository state: provisional M19 profiles, accepted seven-view checks and preserved concurrent M18 work.
- Work performed / changed files / checks / acceptance: Final stable production command MAP_URL=http://127.0.0.1:4179 node tests/building-view-browser.mjs passed 23/23, load 3248 ms, zero page errors, failed requests or HTTP errors. Eight landscape and portrait profiles passed angle, lowered-offset and framing contracts. Real Chrome wheel over canvas, launcher and assistant returned the exact saved overview; document/tail events were synthetic. Existing input suite passed 16/16. Source model/palette hashes stayed unchanged. Silver has ordinary foreground overlap in portrait. The interrupted Vite development run is retained separately as invalidated evidence; it is superseded by production results.
- Decisions: map Y is height; Stern 25%, seven other profiles 20%. Angles estimated from screenshot edges and adjacency.
- Remaining work and handoff: user visual feedback may refine estimates or correct the last image label. Prior backend tasks remain preserved; do not claim the original Chrome tab or physical hardware was verified.
