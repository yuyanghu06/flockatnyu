> Subsequent [current-rule phase-out](test-phaseout.md) records32additionalcase removals and the latest inventory; this report remains its original dated snapshot.

# Test-suite cleanup — October 22, 2026

The user requested maximum safe removal after the repository audit. This pass removed obsolete test programs and redundant assertions while retaining current behavior checks and the historical SQL verification required by project instructions. Production source, assets, migrations and deployment settings were unchanged by this cleanup.

## Removed

- **13 individual registered Node cases:** eight retired JavaScript helper/adapter checks and five unused Miro-status variants. The original full-handler no-Miro/no-forced-scan check remains, with unexpected Miro access now throwing.
- **17 standalone programs:** seven old milestone browser suites, three mixed geometry/camera scripts, four capture-only tools, one extraction diagnostic and two retired planner model wrappers.
- **Six stale/static standalone cases:** five source-substring checks and one obsolete camera-distance formula check. Useful runtime behavior in those files remains.
- **13 obsolete model scenarios:** seven shared scenarios against the retired non-staged worker or removed chat identity gate, five specialized personal-location scenarios, and the recovery wrapper's one unique retired Miro-outage scenario. Other wrapper selections duplicated shared cases and are not counted again. Seven shared chat scenarios and three specialized chat scenarios remain available with explicit model opt-in.
- Removed obsolete original-source/identity/action-gate assertions from two mixed personal-location tests. Their three real SQL creation, retry, correction, active/future projection and expiry cases remain and now pass.

The historical audit and [before-cleanup inventory](test-suite-inventory.csv) remain dated evidence. The [after-cleanup inventory](test-suite-inventory-after-cleanup.csv) records the current registered cases.

## Coverage preserved through consolidation

`tests/map-asset-integrity.test.mjs` contains four actual-asset cases:

1. Production asynchronous Courant/Stern detailing preserves original geometry/materials and uses source colors.
2. Baked streets/parks remain finite, within campus bounds, aligned to source coordinates and clear of the fountain.
3. Leslie model extraction leaves the original tile intact, and replacement preserves neighboring triangles.
4. Coles replacement removes the independently identified source shell and preserves every neighboring triangle.

The current `tests/map-focus-framing-browser.mjs` replaces the old hidden-control/browser setup. It starts an isolated Vite server, mocks API responses, rejects nonlocal requests and drives actual canvas input. Its nine scenario groups preserve 30 landmark framing assertions at three viewport sizes, actual hover/click selection for all ten enabled landmarks on desktop and phone, three opposite-side building selections, absolute Arch/Bobst/Paulson placement, orbit/pan/boundary behavior and actual wheel return to the saved overview camera.

The useful numerical camera, pointer, startup, atmosphere, GCASL and vegetation tests remain. `tests/fixtures/map-config.mjs` shares real configuration loading between Node-only scripts instead of duplicating a loader that failed on relative JavaScript imports. An incidental hardcoded camera-preset count was removed; the test still exercises every configured preset.

## Deleted programs

All paths below are under `tests/`:

| Programs | Why removed |
| --- | --- |
| `map-browser.mjs`, `map-refinement.mjs`, `map-details.mjs`, `map-m4.mjs`, `map-m5.mjs`, `map-m6.mjs`, `map-m7.mjs` | Old hidden controls/baselines and repeated setup. Useful placement, geometry and pointer behavior moved to current checks. |
| `details-geometry.mjs`, `map-boundary-zoom.mjs`, `map-paulson-views.mjs` | Retired model/formula baselines mixed with useful checks now preserved in asset/current browser tests. |
| `gould-front-view.mjs`, `palette-capture.mjs`, `palette-check.mjs`, `map-performance.mjs` | Old capture-only tools with no test assertions. |
| `source-geometry.mjs` | One-off extraction diagnostic; the meaningful source-shell/neighbor guarantee is now a registered asset test. |
| `planner-workload-model.mjs`, `planner-recovery-model.mjs` | Duplicated model scenarios and special behavior for removed automatic worker Miro access. Current staged/Calendar/Miro tests retain their distinct current responsibilities. |

Shared model scenarios were pruned in `scripts/verify-agent-prompts.mjs`; its old worker fixture and exact environment-budget assertions were removed, and a stale monitored Calendar module path was corrected. It is now explicitly a chat verifier, not a staged-worker evaluation. The specialized personal-location model branch retains three chat scenarios. No live-model result is claimed by this cleanup.

## Remaining counts and verification

| Metric | Before | After |
| --- | ---: | ---: |
| Individual registered Node cases | 2,459 | **2,450** |
| Parent tests containing subtests | 40 | **40** |
| Node reported results | 2,499 | **2,490** |
| `.test.mjs` files | 168 | **169** |
| Standalone programs under `tests/` | 54 | **37** |
| Historical individual cases | 147 | **139** |

The registered-case change is **13 removed, four meaningful asset cases added**, a net reduction of nine. The larger consolidation removes 17 separate scripts. Parent tests and inline assertions are not mixed into the individual-case count.

Independent full local run: **2,489 reported passes, zero failures, one optional skip**, 113.916 seconds, exit 0. The skip is the optional observed-Miro-schema fixture absent from `/tmp`. The final async asset version was separately rerun four/four with stable hashes. The final personal-location version passed three/three after optional-scenario pruning. The full run observed no production-source changes; targeted reruns reconcile test-only edits during execution.

Independent retained standalone checks: camera 20, map interactions 16, startup 8, presentation 14, GCASL geometry 11 and vegetation 7: **76 meaningful checks pass**. All 43 migration files are byte-identical to the pre-cleanup audit manifest. The 139 historical SQL cases and their required fixture modules remain.

Production build passes. Normal syntax checks and the no-opt-in model harness invocation pass. Independent final Chrome acceptance: **nine/nine scenario groups pass on unchanged source hashes**, including 30 complete-building/card framing assertions, 20 actual desktop/phone hover-and-click selections, three opposite-side selections and actual orbit, pan, boundary and saved-overview wheel return. No JavaScript errors or nonlocal requests were observed. Earlier incomplete/failed harness attempts remain separate diagnostic receipts; they are not acceptance evidence.

Independent evidence is under `/tmp/techvisualized-test-cleanup-independent/`, with the final browser receipt/screenshots in `browser-verified/`. Coder browser evidence is under ignored `evidence/camera-framing/`. The repository CSV preserves per-file counts. This was local test maintenance. No live club sources or hosted data were changed, nothing was deployed, and no model inference was performed.
