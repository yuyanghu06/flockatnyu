# Gould Plaza geometry and references

This module is a photo-informed model of Gould Plaza's recognizable permanent
layout in pre-renovation NYU photographs. It is not a surveyed model or a claim
about current barriers, landscaping, opening hours or access. NYU documented
construction in summer 2025; later renovation details have not been verified for
this implementation. The model deliberately does not turn proposal renderings
into completed architecture.

## Visual references inspected

Three official NYU images were downloaded and visually inspected. Copies under
`evidence/m3-campus-details/` are research evidence only; no photo is used as an
application texture. Photo copyright remains with NYU/the original photographer.

- [NYU Stern alumni profile: elevated plaza photograph](https://www.stern.nyu.edu/programs-admissions/phd-new/our-community/alumni-spotlight-vilma-todri).
  The image shows pale square paving, broad light crossing bands, red-brown
  junction blocks, the memorial roundel, and the open space beside the curved
  Kaufman entrance. Saved as `reference-gould-overview.png`; photo date unknown.
- [NYU Stern 2019 Javits lecture page: plaza photograph](https://www.stern.nyu.edu/portal-partners/faculty-staff/jacob-k-javits-visiting-professorship-lecture).
  The photograph shows a flush green-glass skylight with dark metal divisions,
  brown slatted benches and pale paving beside Tisch Hall. Saved as
  `reference-gould-glass-paving.png`. The page names the 2019 lecture; this
  establishes the reference era, not an exact shutter date.
- [NYU Stern admissions campus visits](https://apply.stern.nyu.edu/portal/ft_on_campus_events_test).
  The entrance photo shows six visible stone risers, metal rails, red-brown stone
  cheek walls and a Gould Plaza plaque. Saved as `reference-gould-steps.jpg`.
  Its asset name begins `19-0186`; this is not treated as a verified capture date.

Location and adjacency were cross-checked against
[MEET NYU's Gould Plaza page](https://meet.nyu.edu/locations/gould-plaza/) and
[Stern's visitor directions](https://www.stern.nyu.edu/experience-stern/contact-us/visit-stern).
The model represents the court by Stern and Courant on West Fourth Street, not
Schwartz Plaza, Kimmel's entrance or Gould Memorial Library in the Bronx.
[Courant's June 2025 facilities notice](https://cims.nyu.edu/dynamic/news/1482/)
documents plaza renovation closures. No fence or post-renovation garden has been
inferred from that notice.

## Coordinate derivation and source inspection

The original `models/environment/gould-plaza.glb` has a small rotated slab with
world bounds X 96.6986..128.3014, Z 176.7077..205.8923, Y 0.73..0.85. Its whole
scene also includes five trees and nine coarse benches. The old slab covers
roughly 22 by 22 meters, leaving most of the court unmodeled. These trees and
benches are replaced along with the slab, not layered under the new model.

The source Stern and Courant GLBs were decoded with NodeIO and inspected in plan.
Their combined geometry contains no separate plaza stair mesh; their full
building footprints and curved entrance remain untouched. Relevant source data
in `yuyang-site-3d-assets/data/building-runtime.json`:

- Footprint 11632: western Stern/Kaufman mass and curved entrance.
- Footprint 11005: southern Tisch wing, meeting the court along local V=37.15.
- Footprint 11609: Courant, with the court-facing edge near local U=59.3..60.

The plaza's local origin is the recorded Stern corner `[98.137, 0, 174.033]`.
The east axis is the normalized vector `[0.84055, 0, 0.54173]`; the south axis is
its perpendicular `[-east.z, 0, east.x]`. These are converted to world positions
inside the module. The main paving extends U=0.3..58.7, V=0..36.8, with a southern
connector U=49.6..58.7, V=36.8..62.3. The west boundary follows the source rotunda
with a 0.3-meter clearance. It is not a rectangular surface through that building.

Stern's measured minimum Y is 2.89; Courant's is 3.752. The plaza surface gently
slopes from Y=2.93 at the west edge toward Y=3.77 at the east edge. This is a
modeling reconciliation of the exported datums, not a measured paving gradient.
The foundation reaches the application's ground Y=-0.12, and the entrance
foundation is solid down to the same datum. Street terrain is absent in the supplied scene, so the visible
foundation depth must not be interpreted as a surveyed retaining-wall height.

`reference-gould-existing-plan.png` compares the original plaza with both source
buildings; `reference-gould-procedural-plan.png` shows the new courtyard fit. These
are generated geometry checks, not geographic imagery.

## Implemented detail and uncertainty

The model uses 0.56-meter paving pitch, pale major grid bands and terracotta
intersection squares, two green skylight arrays, eight slatted benches near Tisch,
six front risers, stone cheek walls, metal rails, small bins and a simple memorial
disc without invented lettering. Each detail is baked into one of eight material
meshes under a single selectable root. Colors are centralized inside the module.

Paving type, benches, skylight divisions, stair form and materials are supported
by the photographs. Exact tile pitch, furniture count/placement, skylight count
and dimensions, medallion placement and stair width are approximations fitted to
the source court; the photos do not establish survey accuracy. The clear western
rotunda approach, southern Stern entrance and eastern Courant corridor are kept
open. No central trees are added because the chosen views do not support the old
export's grove. No road, traffic, building facade or temporary access control is
part of this module.

## Integration contract and checks

Import `createGouldPlaza` from `src/gould-plaza.js` and replace the entire original
Gould model with its returned Group. Its root transform is identity; coordinates
are already Washington Square meters, Y up. Do not apply another placement or
retain the old plaza model. The integrator supplies stable selection identifier
`nyu-gould-plaza` and visitor-facing information. The root's `userData.architecture`
exposes counts and this document path for test evidence.

Node creation produced eight merged meshes, 15,668 triangles and 6,466 small
pavers in the integrated build. World bounds are approximately
`[78.4535,-0.12,171.7189]` to `[148.7294,4.6505,258.1990]`. Root identity and the
source footprint alignment were checked. These are geometry checks only;
independent integrated browser appearance and selection checks remain required.


Final datum reconciliation: the six photographed upper risers meet a synthetic 14-riser lower flight over 3.92 m. This bridges the roughly 2 m difference between flat scene ground and source building entrances. The lower flight is a modeling accommodation, not a photographed or surveyed feature. All foundations extend to map ground Y=-0.12.

M4 user-directed planting: four small deciduous trees in square planters and three low shrub planters added around court edges. This is a design addition requested by the user, not a claim of existing vegetation. Preserve open skylights, central court and entrance routes. The original M3 triangle count above predates this planting.
