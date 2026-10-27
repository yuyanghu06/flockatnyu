# /api/gmail/send/:requestId endpoints

This folder mirrors the `/api/gmail/send/:requestId` URL segment. Each method file registers exactly its named method and URL.

- [get.js](get.js): `GET /api/gmail/send/:requestId`. The opening comment documents inputs, access, service effects, result states and why this endpoint exists.

Services and authentication are injected by `server/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
