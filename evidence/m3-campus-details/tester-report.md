# Agent pass report

- Milestone / role / scope: M3 independent tester for Silver Towers, the complete
  Leslie eLab host building, and rebuilt Gould Plaza. Palette proposal artifacts
  are owned and checked separately by the orchestrator.
- Starting state and inputs: read current instructions, milestones, tester role,
  three model modules and reference contracts, parent integration, source tile
  metadata, prior tests, and actual reference images. Viewed CTA's tower facade,
  NYU's lab storefront, NYC FEIS View B showing the full Leslie host building,
  and NYU's Gould paving/rotunda and stair photographs. Existing M1/M2 and all
  researcher-owned reference evidence were preserved.
- Changes: created map-details.mjs, details-geometry.mjs and
  gould-front-view.mjs; updated baseline fixtures to nine landmarks, current
  job counts and M3 evidence destinations. Wrote only assigned tests/evidence
  and guides. No app, model, journal, deployment or integration changes.
- Decisions: Silver represents all three University Village towers under one
  selection ID, as the parent's stated scope assumption. Leslie represents its
  complete host building rather than only the ground-floor lab. Gould is a
  photo-informed permanent pre-renovation layout, not current access information.
- Commands / outcomes:
  - `npm run build`: PASS on final model/integration; nonfatal Vite warning for
    the approximately 757 kB main JavaScript chunk remains.
  - `node tests/map-details.mjs`: six checks PASS. All 122 jobs load, nine
    landmarks register, no page errors/failed requests/HTTP errors, and no old
    Gould GLB request occurs. Exact replacement counts are Silver228, Leslie164,
    Coles92. Both angles of Silver and Leslie and Gould overhead/oblique views
    have real hover/click evidence; all nine menu/focus/canvas paths pass.
    Orbit and bounded pan preserve the camera-target offset; mobile canvas at
    390 x 844 and selection remain usable.
  - `node tests/details-geometry.mjs`: PASS. Independent NodeIO decoding of
    tile--1_2 finds1028 source triangles; Silver removes76+72+80, Coles92, leaving
    708 original triangles unchanged. All228 tower source triangles have their
    vertices represented within1mm in the detailed model. Leslie tile has1690
    triangles, removes164 and leaves1526 unchanged. Creating its detailed model
    does not mutate source geometry. Float accessor normalization and tolerant
    comparisons are handled explicitly in the independent fixture.
  - `node tests/map-browser.mjs`: all ten updated regression checks PASS,
    including all nine actual canvas selections, JSON restore, invalid JSON,
    clipboard-denied fallback, 700m camera boundary and responsive canvas.
  - `node tests/map-failures.mjs`: all three PASS. Deliberately blocking Bobst
    leaves121 jobs loaded with a visible error; delayed-load resize and missing
    WebGL status both remain correct.
  - `node tests/gould-front-view.mjs`: final camera restored and screenshot
    captured; visually verified the full stair approach meets the flat ground.
- Actual findings and fixes: original preview process had exited; started a new
  loopback preview. First Gould entrance test camera was inside a neighboring
  building; corrected test camera without changing application controls.
  Independent review/modeler found the Gould foundation elevation gap; after
  grounding it, our low front screenshot exposed a roughly2m vertical curb below
  the six upper risers. Parent added an explicitly inferred lower flight to
  reconcile flat-ground and source building elevations. Final screenshot shows
  continuous steps instead of that curb. Parent also restored the photographed
  occupied top residential window row on Leslie; final images reflect the fix.
- Visual comparison: Silver has warm concrete frames, broad blank returns and
  regular recessed dark bays resembling the CTA reference, preserving the source
  pinwheel shells and roofs. Leslie preserves source setbacks and now shows buff
  walls, dark multi-pane windows, pale trim, upper occupied tier and storefront
  cues consistent with the two references. Gould's pale grid, red junctions,
  skylights, benches and clear curved rotunda edge match identifiable photo
  features. Final overhead view shows a sensible courtyard fit without duplicate
  old slab/trees; low view shows grounded stairs. Exact facade spacing, furniture
  placement and especially the added lower approach are approximations.
- Final numeric models: Silver5 meshes/111108 triangles; Leslie7/31772 with498
  windows; Gould8/15668 including14 inferred lower approach risers below the six
  photographed upper risers. Complete objects share their registered selection
  roots, including facade details and plaza furniture.
- Performance: Windows Chrome154, 1440 x 1000, ANGLE NVIDIA RTX5060 Ti Direct3D11;
  final 90-frame sample averages6.06ms (~165FPS), p956.1ms,391 draw calls and227062
  visible triangles at startup. Software SwiftShader baseline averages about
  141ms (~7.1FPS), which is not representative of hardware rendering. These are
  local short samples; physical mobile hardware/touch was not tested.
- Acceptance verdict: PASS for M3's photo-informed map-detail scope, with stated
  source/fidelity limits. No survey accuracy, current plaza access, physical
  reflections, interiors or exact window positions are claimed. Some ordinary
  context geometry can occlude an intended building, correctly affecting hits.
- Guides / handoff: tests/info.md and evidence folder guide updated. Preview at
  http://127.0.0.1:4173/ runs in new exec session15694, HTTP200 reconfirmed. Parent
  should journal this report and the independent evaluation before acceptance.
