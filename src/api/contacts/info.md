# /api/contacts endpoints

This folder mirrors the `/api/contacts` URL segment. Each method file registers exactly its named method and URL.

- [get.js](get.js): `GET /api/contacts`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.
- [post.js](post.js): `POST /api/contacts`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.

Child URL folders: `[id]/`, `import/`.

`register.js` composes the five saved-Contacts method handlers for isolated tests; the production root also registers them explicitly. Treg importing is a separate endpoint under `import/treg/`.

Services and authentication are injected by `server/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
