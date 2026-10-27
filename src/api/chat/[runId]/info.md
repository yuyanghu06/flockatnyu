# /api/chat/:runId endpoints

This folder mirrors the `/api/chat/:runId` URL segment. It does not itself add a new endpoint.

Child URL folders: `steer/`.

Services and authentication are injected by `server/runtime/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
