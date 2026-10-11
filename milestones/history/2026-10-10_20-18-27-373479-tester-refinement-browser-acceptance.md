# refinement-browser-acceptance

- Local timestamp / acting role / milestone: 2026-10-10T20:18:27.3734790-04:00 / tester / M2.
- Requested scope: Independent M2 navigation, coverage, facade and regression checks.
- Starting repository state: Expanded map and photo-informed model; panel logic/contrast fixes integrated.
- Work performed / changed files: map_tester created M2 test scripts, updated obsolete baseline fixtures, preserved M1 evidence and captured M2 screenshots/results/report/guides. Final targeted Paulson screenshots refreshed after material-only refinement.
- Decisions: Test occlusion-visible surfaces rather than select hidden geometry. Keep architecture approximation distinct from measured placement.
- Checks and evidence: Production build passed.6M2 checks+10regression checks+3failure checks passed, plus max700m wheel/boundary/orbit checks. All six buildings canvas-selectable, Paulson selectable from three sides with whole-model highlight. Starting distance240.9752133m; clamped panning preserves direction; out-of-bounds restore rejects. Source Coles92triangles removal preserved. Original GLB unchanged. Short GPU sample about165FPS on RTX5060Ti at1440x1000,396draw calls/180426triangles. No page errors or missing requests.
- Resulting state / acceptance: M2 functional and visual tests pass. Full report evidence/m2-campus-refinement/tester-report.md.
- Remaining work and handoff: Integrate evaluator acceptance and user handoff. Physical touchscreen hardware and survey-grade architectural accuracy unverified.
