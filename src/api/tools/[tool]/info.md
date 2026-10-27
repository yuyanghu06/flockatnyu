# /api/tools/:tool endpoints

This folder mirrors the `/api/tools/:tool` URL segment. Each method file registers exactly its named method and URL.

- [post.js](post.js): `POST /api/tools/:tool`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.

Services and authentication are injected by `server/runtime/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
