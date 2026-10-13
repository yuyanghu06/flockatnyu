# Independent eighth-view production pass

- Milestone / role / scope: M19 / tester / add Silver Center screenshot profile
  and repeat acceptance on the stable current production build.
- Starting state and files inspected: previous seven-view21/21 and unit16/16
  accepted evidence; updated building-views Silver profile and root acceptance
  contract197degreeazimuth/original60degreepolar/.8heightfactor.
- Work performed and changed files: added eighth independent profile tuple in
  tests/building-view-browser.mjs; refreshed tests/info.md and this folder guide;
  captured sixteen current building views and updated browser-results.json.
- Decisions and assumptions: orchestrator interprets the latest image labeled
  Stern as Silver Center from its visible facade/roof/adjacent Leslie geometry.
  This is an explicitly documented inference; confirmation remains a product
  preference. Original seven profile contracts remain unchanged.
- Checks: `MAP_URL=http://127.0.0.1:4179 node tests/building-view-browser.mjs` —
  exit0,23/23. Root provided current production preview; no HMR socket or live
  backend/model operation. Installed Mac Chrome154.0.8037.99/headless;
  landscape1440x1000 and portrait390x844. Loading3248ms; console/errors/failed
  requests/HTTPerrors all empty; entry gate and all earlier native-wheel return,
  synthetic document/tails and actual merged-detail hover/click checks passed.
- Checks: Silver direction and reduced height ratio pass in landscape; both
  aspect ratios preserve camera distance bounds and project full building AABB
  within view. Portrait distance336.3521m, target[146.8233,29.7662,53.2542],
  selectable geometry7meshes/73892triangles. Both Silver images were visually
  inspected and show the expected roof equipment and main window facades.
- Findings / failures: first eighth-view development attempt exited1 after
  a live page reload during actual canvas return. __map disappeared/reinitialized,
  later portraits showed the loading gate. Diagnostic is preserved separately as
  eight-view-hmr-invalidated-results.json; it is not accepted application evidence.
  Stable production rerun passed all23 and refreshed every current screenshot.
- Findings / visual limitations: portrait Silver fit shows more neighborhood;
  a pale church partially occludes the lower-left/storefront. Main facades/roof
  remain readable. Stern still intentionally crops its multi-wing group and has
  right foreground context partly occluding rotunda. Exact pixel matching of
  supplied screenshots and physical trackpad/touch hardware remain unverified.
  Existing user Chrome tab verification is owned/reported separately by root.
- Performance observation: rolling300frame p50interval16.7ms/p95interval28.9ms;
  388geometries/1texture/7programs. This is not a dedicated benchmark.
- Acceptance verdict and remaining work: PASS23/23 for current eight-profile
  production scene and interaction acceptance contracts. No new implementation
  defect established; evaluator should review current rendered captures.
- Folder-guide updates: tests/info.md and evidence/m19-building-views/info.md
  updated. Shared milestone journal remains root-owned.
- Handoff: root serializes this followup testing pass after its report review;
  preserve inferred Silver identity and user-tab/exact-pixel/hardware limitations.
