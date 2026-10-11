# Server source

Incomplete M15 scaffold: `index.js` starts Hono; `config.js` reads server environment; `app.js` guards status/chat routes and normalizes streaming; `providers/` contains provider protocol adapters; `knowledge.js` owns scoped persistence; `worker.js` is a no-op connector boundary. No credentials belong in source or browser imports.

See [backend status](../docs/assistant-backend.md) for current checks, stale dependency lock, unresolved request/retrieval limits and unverified runtime behavior. Development is stopped for the requested snapshot; no completion or deployment is claimed.
