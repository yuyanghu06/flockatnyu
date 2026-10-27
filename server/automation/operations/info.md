# Worker operation helpers

`intent.js` contains the existing pure check for unsafe Calendar interpretations
of Discord text. Moving it does not change its accepted or rejected inputs.

`finish-batch.js` executes the existing batch-completion checks and queue
bookkeeping through the private `finish_batch` endpoint. Trusted handler context
chooses the step and supplies the principal, lease, signal and saved execution
history. Model arguments supply only the existing completion IDs. The handler
still renews its lease, rechecks access and records outcomes between steps.
Calendar-to-map synchronization stays a separate named runner call.

The main adapter builds server-owned operation definitions and binds the final
catalogue to the private API. Prepared arguments stay server-side behind opaque
references so request-local identity checks still see their original objects.
