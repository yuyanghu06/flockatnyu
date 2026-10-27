# /api/treg endpoints

This folder mirrors the `/api/treg` URL segment. It does not itself add a new endpoint.

Child URL folders: `companies/`, `people/`.

`register.js` is the optional composition seam for all four dormant lookup handlers. The production root does not import it; never activate these paid operations as a side effect of file cleanup.

Services and authentication are injected by `server/app.js` through the root
registration module. Shared helpers live in `_shared/`; browser code must not
import these server-only handlers. Preserve exact public behavior when editing.
