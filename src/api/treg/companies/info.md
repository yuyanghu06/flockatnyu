# /api/treg/companies endpoints

This folder mirrors the `/api/treg/companies` URL segment. It does not itself add a new endpoint.

Child URL folders: `enrich/`.

Services and authentication are injected by `server/runtime/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
