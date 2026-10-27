# Discord tool clients

The three JavaScript files preserve the tool names used by chat and workers.
`index.js` exposes live reads and argument-helper compatibility exports,
`live-summary.js` adds the explicitly named summary operation, and `draft.js`
exposes message drafting. Their constructors now build clients for the private
operation API; they do not read Discord or prepare drafts themselves.

`server/discord/operations` holds schemas, checks and execution. Those services
use the existing Discord reader, metadata and authorization clients. Drafts remain
read-only: returning draft text never sends a message or saves a Discord draft.
Summary inference is available only through the named summary operation and keeps
its existing bounded request budget. Do not import these thin clients from backend
operation services; use the backend operations or pure helpers directly.
