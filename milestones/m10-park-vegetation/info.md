# M10: Park vegetation

User requests greenery throughout the actual mapped parks from M6. Inspect all
53 source leisure=park parts, including one elevated part excluded from ground
planting. Do not treat all land-cover polygons as parks. Restrict plantings to
explicit eligible grass/garden/wood/scrub cover intersected with actual parks.
Exclude hardscape, paths, roads, buildings, holes, water, fountains, boundaries
and existing vegetation; use deterministic placement and restrained density.

Coder owns park-vegetation module, offline bake tool/new GLB/audit JSON and
reference guide. Root owns main integration and journals; independent testing
and review follow the bake. Existing assets and the user's server stay unchanged.
Acceptance needs deterministic geometry/exclusion/per-park counts and efficient
merged/instanced rendering; browser appearance remains unverified due to denial.

First bake independently passed geometric checks, but source review identified exclusion boxes from1072unloadedcontexttree meshes. Rebuilding with actual runtime vegetation/fountain/proceduralGould exclusions; first71/117 counts are provisional until correction. Runtime identity job integrated.

Corrected final bake:72trees117shrubs21eligibleparts,246actualsceneexclusions,4meshes17136triangles1237144bytes. Independent8/8checks and source evaluator accepted; runtime identity load integrated. All53sourceparkparts audited. Browser appearance/performance acceptance remains pending access.
