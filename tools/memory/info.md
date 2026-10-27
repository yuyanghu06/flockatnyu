# Shared memory tool clients

`index.js` preserves the two memory tool definitions and constructor while routing
execution through the private operation API. The backend implementation lives in
`server/knowledge/operations/memory.js`; the existing memory store performs saved
reads and exact-version writes.

The constructor's initial `read` convenience method also crosses the private
read endpoint. Model reads and writes retain their separate current-conversation
and snapshot checks. Successful results update the trusted in-memory snapshot;
the API body cannot supply that snapshot or authorize a write.
