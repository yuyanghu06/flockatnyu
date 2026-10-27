# /api/map/people/:personId/avatar endpoints

This folder mirrors the `/api/map/people/:personId/avatar` URL segment. Each method file registers exactly its named method and URL.

- [get.js](get.js): `GET /api/map/people/:personId/avatar`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.

Services and authentication are injected by `server/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
