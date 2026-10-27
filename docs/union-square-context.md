# Union Square source-model restoration

The source export contains separate baked models for `25-union-square-west.glb`
and `235-park-avenue-south.glb`. They were absent from this application's asset
load list, although the corresponding city tiles omit those buildings' main
surfaces. This leaves incomplete parcels. Restoring the already-exported models
is the minimal correction; no new facade or footprint is invented.

NYU's [Carlyle Court housing listing](https://housing.nyu.edu/residencehalls/Detail?id=3)
and [residence organization page](https://engage.nyu.edu/organization/carlyle-court)
identify Carlyle Court at 25 Union Square West as three buildings around a
courtyard. Those primary references were verified by the orchestrator. The local
geometry audit below establishes which missing export can be restored; it does
not independently survey or rename every adjacent building wing.

## Exact integration contract

Both existing assets are registered in `src/map/data/assets.js` and loaded as context:

| File under `assets/yuyang-site-3d-assets/models/buildings/` | Source footprint | Triangles | Minimum X/Y/Z | Maximum X/Y/Z |
| --- | --- | --- | --- | --- |
| `25-union-square-west.glb` | 5449 | 3,460 | 501.809 / 5.560 / -623.013 | 532.222 / 55.125 / -589.758 |
| `235-park-avenue-south.glb` | 5389 | 5,058 | 793.264 / 3.570 / -779.974 | 839.786 / 60.660 / -749.980 |

Load at identity: no translation, rotation or scaling. Generated positions already
use the Washington Square origin and Y-up meters. Assign the existing pale context
material with vertex colors disabled to the complete mesh, retaining all buffers,
indices, geometry and transforms. Do not create new selectable landmark IDs.
`main.js` also assigns Lipton the pale material while retaining its landmark
registration. Other Union Square city tiles already use the same neutral material.

Do **not** remove any triangles from city tiles. In `tile-2_-4.glb`, Carlyle's
missing footprint contains eight vertical boundary triangles, all also belonging
to adjoining source footprints 5886 or 5897. There are no horizontal triangles
inside the missing parcel. These shared neighboring walls must remain. Existing
adjacent footprints 5507, 5886, 5897, 6270 and 6362 retain respectively 96, 115,
64, 92 and 153 matching source triangles in that tile. Loading only the bounded
missing asset preserves those wings/neighbors and does not fill the courtyard.

At 235 Park Avenue South, the neighboring tile geometry contributes nine boundary
matches across tiles `4_-4` and `4_-5`. One is a nearly collinear floor sliver at
Y=1.405m, below the restored model's Y=3.57m base; there are no matching horizontal
surfaces at the model's elevation. This existing neighbor geometry likewise
requires no subtraction. Both source model X/Z bounds match their recorded
runtime footprint bounds to within one millimeter.

## Reproducible checks

Run `node tests/union-square-context.mjs`. It decodes the original Meshopt tiles
using the repository's GLTFLoader and decoder, checks both exact triangle counts
and world bounds, verifies the missing horizontal surfaces and Carlyle's boundary
wall ownership, and confirms neighboring geometry remains present. It also
replaces materials in memory to prove every geometry attribute/index and world
transform remains unchanged, then verifies all seven input file SHA-256 hashes.

`evidence/m11-union-context/source-audit.json` contains the numeric audit and
hashes. The test is filesystem-only and does not change the source export.
The material check exercises the intended material-only operation; actual loader
registration is owned by the orchestrator. No browser, GPU render, or live
appearance is claimed by this pass. Restoring this existing stylized export
corrects missing source massing but is not an as-built architectural survey.
