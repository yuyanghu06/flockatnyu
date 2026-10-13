# Building view and screen-wide scroll evidence

M19 tests eight screenshot-derived landmark views with Stern's camera height
reduced 25% and Courant, Bobst, Kimmel, GCASL, Paulson, Leslie eLab and Silver
Center reduced 20%. Silver Center is the orchestrator's interpretation of the
latest image labeled Stern, following its visibly different building geometry.
Azimuth/polar estimates are derived from screenshots; height reduction applies to
the camera's Y-up offset above its target. Stern deliberately frames the rotunda
and plaza rather than fitting its whole multi-wing selectable group.

`browser-results.json` records the final independent production-preview Chrome
run: 23/23 checks, normal loading/entry, eight landscape and portrait captures, real wheel input
over canvas/assistant UI, document synthetic input, gesture tails and merged
Courant detail motion. `interaction-results.json` records 16 synthetic input
checks. `source-invariants.json` records unchanged palette/model source hashes.
`tester-report.md` preserves the initial seven-view21/21 acceptance pass and
`seven-view-browser-results.json` retains its numeric evidence.
`tester-silver-addendum.md` records the subsequent eighth-view23/23 production
pass. `eight-view-hmr-invalidated-results.json` preserves an unaccepted
development run where a live reload reset the app during the test; the stable
production preview avoids that interference. Current view images are all from
the stable production run, with no loading gate visible.

The initial `initial-browser-results.json` and
`paulson-portrait-initial-failure.*` preserve a conservative whole-AABB projection
false positive. Unequal-height towers leave that high corner empty. The final
test projects all occupied Paulson mesh vertices after matching live bounds and
triangle counts; the visible geometry fits in portrait. These initial artifacts
do not establish an application defect.

Root-owned camera trace evidence may also be present here. This tester used an
isolated installed Chrome instance; control of the user's preexisting tab is
reported separately by the orchestrator. No live model/backend operation ran.
