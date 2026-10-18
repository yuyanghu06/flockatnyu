# Asset folder dependency review

- Local timestamp / acting role / milestone: 2026-10-17_15-20-02-948136 America/New_York / orchestrator / post-M39 advisory.
- Requested scope: determine whether yuyang-site-3d-assets/ is still needed.
- Starting repository state: clean working tree; M39 publication complete.
- Work performed / changed files: inspected startup records, asset README, runtime imports and script/test references. Updated milestone snapshot, to-do and this history entry only.
- Decisions: retain the folder; deletion breaks current map asset resolution. Consolidation or pruning is future work, not requested implementation.
- Checks and evidence: src/assets.js directly references 122 existing GLBs (110 city tiles and 12 other models); src/main.js imports that registry. src/config.js imports landmark-placements.json. Scripts/tests also reference the folder. Python path check found zero missing registry files; folder contains 506 files and du reports 24M. The documented root ZIP is absent in this checkout.
- Resulting state / acceptance: question answered from source inspection; no assets or application code changed, no build/browser run and no independent specialist pass.
- Remaining work and handoff: retain required models/metadata; any future cleanup should audit script/test inputs and preserve provenance before moving or removing files. Existing MVP work remains unchanged.
