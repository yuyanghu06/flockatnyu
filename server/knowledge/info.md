# Saved shared knowledge and bug reports

`memory.js` reads and updates the existing saved shared memory document. `bug-reports.js` records explicitly authorized bug-report submissions through the existing bounded server-side store.

Their model tools remain separate under `tools/memory` and `tools/bug-reports`. These stores do not retrieve Discord, Gmail, Calendar, Miro or other originals. Preserve authentication, exact-update checks, content limits and permitted operational logging.
