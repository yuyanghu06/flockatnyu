# Google operation services

These server-only modules execute Google tools after their fixed private API
endpoints authenticate an in-process request. They call Google provider clients;
they do not import model tool clients or fetch another service implicitly.

`google.js` checks Gmail/Drive access and dispatches bounded source reads.
`calendar.js` validates the fixed Calendar target and projects write receipts.
`chat-calendar.js` holds request-local event revisions and exposes requested
Calendar creates, edits and cancellation. `calendar-batch.js` handles independent
rows in a requested batch; `calendar-boundaries.js` validates times and local
clock conversions; `calendar-batch-receipts.js` projects bounded saved results.
The definitions files retain the existing model schemas and descriptions.

`gmail-send.js` retains request-local duplicate calls, deterministic send IDs and
uncertain-write fences. The existing Gmail-send service remains responsible for
durable receipts and provider authorization. Reads never send mail.

Factories under `server/operation-api/factories` bind these operation services to
private API clients. The tool files expose those factories and metadata. Worker
composition uses these services directly before binding its final guarded
operation catalogue to the same private API.
