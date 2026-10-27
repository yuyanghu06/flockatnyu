# /api/contacts/:id endpoints

This folder mirrors the `/api/contacts/:id` URL segment. Each method file registers exactly its named method and URL.

- [get.js](get.js): `GET /api/contacts/:id`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.
- [patch.js](patch.js): `PATCH /api/contacts/:id`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.
- [delete.js](delete.js): `DELETE /api/contacts/:id`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.

Services and authentication are injected by `server/runtime/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
