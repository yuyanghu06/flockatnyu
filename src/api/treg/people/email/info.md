# /api/treg/people/email endpoints

This folder mirrors the `/api/treg/people/email` URL segment. It does not itself add a new endpoint.

Child URL folders: `find/`, `verify/`.

Services and authentication are injected by `server/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
