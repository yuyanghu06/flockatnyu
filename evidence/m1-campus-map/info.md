# M1 campus map evidence

The original `01-source-scene-target-identification.png` predates this browser
pass and is preserved unchanged. `02-campus-desktop.png`,
`03-paulson-selected.png` and `04-campus-mobile.png` show the final production
preview. `05-asset-failure.png` demonstrates an intentionally blocked Paulson
request and visible partial-load reporting.

`browser-results.json` records the final ten browser checks and numeric bounds.
`failure-results.json` records the final three failure/loading checks;
`pre-fix-failure-results.json` preserves the reproduced delayed-load resize bug.
`source-tile-check.json` independently analyzes source tile geometry.
`default-gpu-performance.json` distinguishes hardware timing from software
SwiftShader timing in the browser suite. See `tester-report.md` for scope and
limitations. Reproduce with scripts documented in `tests/info.md`.
