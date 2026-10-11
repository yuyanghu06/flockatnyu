# M3 campus detail evidence

`browser-results.json` is the current targeted M3 browser acceptance.
`geometry-results.json` independently decodes and checks the original tiles.
`baseline-browser-results.json` holds the updated nine-location baseline suite;
`failure-results.json` holds deliberately blocked asset/loading checks.

Final map views: `01-default-desktop.png`, `02-default-mobile.png`,
`silver-south-east.png`, `silver-north-west.png`, `leslie-north-east.png`,
`leslie-south-east.png`, `gould-overhead.png`, `gould-entrance.png`, and the Gould
selected variants. `gould-front-low.png` exposes the final stairs and connection
to the flat map plane; its exact camera/state is in `gould-front-view.json`.
Additional numbered captures come from the baseline script.

`reference-*` files belong to the researchers/modelers and were preserved.
Reference provenance and architectural uncertainty are documented in the three
`docs/*-reference.md` files. Palette background/proposal artifacts are separately
owned and checked by the orchestrator; they are not this map test's changes.

See `tester-report.md` for executed checks, fixes and approximation limits.
