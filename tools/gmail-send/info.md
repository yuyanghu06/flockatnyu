# User-requested Gmail sends

`index.js` exposes only `send_gmail`, separately from Google read tools and the
worker catalogue. The model supplies literal recipients, a subject and plaintext
body. The current user must request the send; selected contacts, quoted mail and
source content are data, not permission. The tool never looks up a recipient or
reads another service. The prompt chooses those separate tools when needed.

`createRequest` requires the backend principal and stable browser request UUID.
Exact repeated arguments reuse an operation; deterministic ordinal IDs survive
request retries. The durable service binds the payload separately and fences an
entire group after uncertainty. The adapter also stops new sends after uncertainty
or a conflict. Only a validated accepted-send receipt counts as success; it does
not prove delivery. No message content enters tool receipts or this folder.

The runtime integrates this adapter only into user-directed chat. Direct stateless
execution refuses writes. Operational receipts and Google account/scope checks
live in `server/gmail-send-service.js` and the dedicated Google send client.
