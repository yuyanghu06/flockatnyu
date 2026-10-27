# /api/map/people/:personId endpoints

This folder mirrors the `/api/map/people/:personId` URL segment. It does not itself add a new endpoint.

Child URL folders: `avatar/`.

Services and authentication are injected by `server/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
