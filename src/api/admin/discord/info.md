# /api/admin/discord endpoints

This folder mirrors the `/api/admin/discord` URL segment. Each method file registers exactly its named method and URL.

- [get.js](get.js): `GET /api/admin/discord`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.

Child URL folders: `channels/`.

Services and authentication are injected by `server/runtime/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
