# Operation API Calendar fixture

`worker-calendar.mjs` supplies isolated native Calendar behavior for production
operation-API transport tests. It uses simulated storage, preserves exact event
identities and conditional versions, and makes no real provider calls.
