# M6: Streets, parks and pedestrian surfaces

User explicitly authorizes roads, sidewalks and pedestrian paths plus park
geometry across the existing loaded map extent X[-960,960], Z[-960,1152]. This
supersedes the earlier export exclusion. Prioritize coherent real network shapes,
clean material/curb edges at close zoom, not traffic or excessive street furniture.
Use offline, attributed OSM geometry aligned to the source coordinate system.

Data specialist owns snapshot/fetch script/provenance. Road coder owns streets
renderer; root handles park renderer and integration because further delegation
hit the agent thread limit. Validate map alignment, connected intersections,
path/lawn layering, source footprint exclusions, no z-fighting, landmark controls
and render costs. Geometry detail/widths can be inferred when tags lack dimensions
but must be documented. Do not claim survey completeness.

Implemented: offline source4830ways/564surfaceparts, final52parkparts/558coverparts,10mergedmeshes/230451triangles. Fullbrowser10/10 plus finalmetadata/clearance/close-view3/3 pass. 16.6MBbake; sourcewidths/grades approximate and mobile/network performance unverified.

Status: accepted by independent evaluator after final build and close-view evidence. No unresolved material findings.
