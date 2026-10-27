# Attio tool clients

`index.js` exports the existing five tool definitions and constructor. Constructed
tools call the private operation API, which dispatches to
`server/attio/operations` before the existing Attio provider client.

The backend operations own source/object/write checks, bounded record projection
and request-local exact-read permits. Updates consume their exact-read permit;
identical writes share their in-flight or settled receipt. An uncertain write
blocks further different writes for that request. Later human input advances a
private input counter while retaining prior receipts, read permits and uncertainty
protection. These protections must remain in backend request state, rather than
being reconstructed from API JSON. There are no delete tools or schema writes.
