# NYU Campus Atlas

Local 3D preview of NYU's Washington Square campus, built with Vite and Three.js.
The first interactive preview is implemented and browser-verified. Verification
results and remaining limitations live in [the milestone snapshot](milestones/milestone.md).

## Run locally

Use Node.js 22.12+ (or a compatible newer release).

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

The production preview normally uses http://127.0.0.1:4173. This is a local
preview; no deployment or external service setup is required.

## Explore and share a view

- Left-drag to orbit, right-drag to pan, and scroll to zoom. On touch screens,
  use one finger to orbit and two fingers to pan/pinch.
- The starting zoom uses your saved 240.975-meter camera distance. Viewing angles
  remain free; panning stays within the populated campus and zoom ranges from
  15 to 700 meters to keep the surrounding map useful.
- Select a campus landmark in the map or building selector. Selection leaves
  the camera where it is; use the optional focus button to move closer.
- Use **Reset view** to return to the initial campus angle.
- Open **Camera angle**, then **Copy camera**. If clipboard access is unavailable,
  select and copy the JSON from the text field. Send that JSON to share your angle.
- Paste saved JSON into the same field and choose **Restore angle**.

## Assets and scope

The map uses 110 city tiles around Washington Square and Paulson, Bobst Library,
the arch, Lipton Hall, Courant, Stern, park scenery, and the extracted John A.
Paulson Center. Paulson now has a photo-informed glass podium, stepped towers,
window panels, fins and planted terraces. It is an architectural approximation;
exact setbacks and window spacing are inferred. The original extracted GLB is
preserved. The runtime model follows the recorded footprint and replaces the old
Coles Sports Center. See [visual references and modeling notes](docs/paulson-reference.md).

Roads, sidewalks and mapped park paths now cover the loaded campus region. Traffic and distant waterfront scenery remain outside this preview.
Calendar, Discord, Drive, authentication, database, and club assistant integrations
are future work. No sample club events are presented as real information.

Preserve the original GLB metadata and applicable licenses. See the
[exported asset documentation](yuyang-site-3d-assets/README.md) and
[asset manifest](yuyang-site-3d-assets/asset-manifest.json).
OpenStreetMap-derived geometry is attributed to
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

## Project guides

The initial preview passed 13 browser/failure checks. M2 verification covers the
expanded map, camera boundaries, and photo-informed Paulson model; see the current
[milestone snapshot](milestones/milestone.md) for results and measurements.
See [test instructions](tests/info.md) and [current view](evidence/m2-campus-refinement/01-default-campus.png).

- [Project instructions](AGENTS.md)
- [Current milestone and verification](milestones/milestone.md)
- [Prioritized work](milestones/to-do.md)
- [Agent workflow](docs/agent-workflow.md)
- [Original implementation brief](docs/initial-map-prompt.md)

## Campus details and color samples

The latest map includes Kimmel Center, Silver Center and the full
Leslie eLab host at 12–16 Washington Place. Silver Towers retain ordinary city geometry after the user corrected the target to Silver Center. Gould Plaza now fills its surrounding
court with paving, skylights, seating, four planter trees and three shrub planters. Models are photo-informed approximations;
Gould includes a synthetic lower approach to reconcile source elevation datums.
See the three building reference documents in `docs/` for evidence and limits.

Open [Tech@NYU color samples](http://127.0.0.1:4173/docs/color-schemes.html) with the
preview running. [Token and brand notes](docs/color-schemes.md) accompany the three
interactive proposals. The live map retains its existing palette.

Courant and Stern now have thin window frames, mullions and projecting sills in their existing palettes. Original geometry and material colors remain intact. See [detail notes](docs/courant-stern-detailing.md) and [before/after evidence](evidence/m5-window-details/).

The street/park layer uses an attributed offline OpenStreetMap snapshot with coherent intersections, curb edges and mapped park holes. Regenerate with python tools/fetch-streets-parks.py --reuse then node tools/build-streets-parks.mjs. Widths and terrain transitions are approximate; see [data provenance](docs/streets-parks-data.md) and [surface notes](docs/streets-rendering.md).

## Discord archive and assistant retrieval

A separate one-shot archive worker, admin channel configuration and source-scoped text/date/author search are implemented locally. Optional semantic embeddings are off by default. Open /admin.html with the local API and administrator access configured; run npm run worker:discord for a configured archive job. See [setup, permissions and limitations](docs/discord-archive.md). Local tests and production build pass; no live Discord history, hosted migrations, production authentication or Railway deployment is claimed.
