# Paulson Center visual reference and model contract

This is a photo-informed architectural approximation for the campus map, not a
surveyed or as-built reconstruction. The preserved extracted GLB remains the
original coarse source asset. The new model replaces its uniform slab visually.

## References actually inspected

The following four images were downloaded from the architect's project page and
opened with `view_image` on 2026-10-10. Their local files are research evidence,
not application textures or bundled assets. Credit remains with their creators;
no additional redistribution license is asserted.

| Local reference in `evidence/m2-campus-refinement/` | Source / credit | Visual use |
| --- | --- | --- |
| `reference-paulson-exterior.jpg` | [Houston exterior](https://kierantimberlake.com/wp-content/uploads/2017/01/nyu2.jpg), Connie Zhou / JBSA | Narrow tall south tower, recessed vertical strip, pale projecting fins, stepped podium |
| `reference-paulson-campus.jpg` | [Elevated context](https://kierantimberlake.com/wp-content/uploads/2017/01/nyu5-scaled.jpg), James Ewing / JBSA | North student volumes, terraces, staggered glass planes and roof setbacks |
| `reference-paulson-section.jpg` | [Mercer section](https://kierantimberlake.com/wp-content/uploads/2017/01/nyu10.jpg), KieranTimberlake project illustration | Different north/south heights, open separation over the academic podium |
| `reference-paulson-facade.jpg` | [Facade close-up](https://kierantimberlake.com/wp-content/uploads/2017/01/nyu11.jpg), Connie Zhou / JBSA | Irregular projecting blue-gray panels, dark joints and angled shadowed edges |

The [architect's project page](https://kierantimberlake.com/work/181-mercer/)
describes transparent perimeter circulation and landscaped roofs. Visual inspection
shows reflective teal/blue-gray glazing rather than a uniformly gray solid wall.
Metal fins and fine floor joints provide vertical and horizontal rhythms. The
student-facing volumes include irregular projecting panels; the taller southern
tower reads as a narrower stack with inset vertical surfaces. The model simplifies
these features into merged geometry and restrained material colors.

The [AIA award page](https://www.aia.org/design-excellence/award-winners/john-paulson-center-nyu)
identifies a five-story academic base and faculty tower with 23 stories.
[CTBUH/CVU's complex entry](https://www.skyscrapercenter.com/complex/5988)
lists the faculty and student towers at rounded heights of 91 and 69 meters.
The [faculty tower entry](https://www.skyscrapercenter.com/building/john-a-paulson-center/28054)
gives 91.1 meters; this model uses the rounded 91-meter figure appropriate to
the approximate surrounding geometry.

## Implemented geometry and coordinate contract

`createPaulsonModel(metadata)` in `src/paulson.js` accepts the existing Paulson
entry from `assets/campus-assets/data/extracted-buildings.json` and returns one `Group`.
All vertex positions are baked into Washington Square map meters with Y up.
Keep its root at identity; do not apply the original GLB's scale, rotation or
translation again. Assign the stable building ID and use the existing whole-root
material highlight/selection routine.

The origin is footprint point 3; the width axis follows point 3 to point 4.
The perpendicular length axis points south along Mercer toward Houston. The
base follows the complete recorded polygon. Base elevation is the recorded
placement Y of 2.4857 meters. The tallest north residence component reaches
69 meters above this ground; the tallest southern faculty component reaches
91 meters including the modeled parapet. Fin projection is roughly 0.4 meters.

The stepped student wings, two offset faculty planes, academic roof volume,
roof equipment, planted strips, perimeter rail, canopy, facade panels, and fins
are merged into eight material meshes. No individual window remains a scene
object. The final local check counted 52,440 triangles. World bounds were
`[-65.4264, 2.4857, 411.0456]` to `[39.8544, 93.4857, 535.2313]`.
The original source GLB and authoritative metadata are unchanged.

## Approximation limits and checks

Podium height (25.48 meters), individual setback widths/depths, intermediate
roof elevations, window pitch and projection pattern are inferred for visual
legibility; they were not measured from construction drawings. Panel boxes
suggest projection and shadow but do not reconstruct the exact angled glazing.
Opaque, varied blue-gray materials approximate reflective glass under the map's
warm lighting; there are no photo textures, interiors, or physical reflections.
Some adjoining volumes overlap internally as a rendering simplification.

Node checks instantiate the actual module, measure its bounds/triangle count,
and verify its eight merged meshes. Browser checks of final appearance,
selection, clipping, relative scale and performance are owned by the tester.
The source photos establish visual features, not survey-grade alignment.
An initial browser comparison revealed that the panel variation formula repeated
whole-floor bands; the corrected formula varies by both bay and floor to produce
staggered individual student panels. A second comparison reduced contrast on the
faculty tower and podium to continuous glass with restrained column highlights,
matching their different facade treatment. Bounds and mesh counts stayed unchanged.
