# Bug report tool

`index.js` exposes bug_reports to the chat agent. It writes one structured product
bug report per chat request through server/bug-reports.js. Unknown details stay
blank; the original current user message, UUID and timestamp are server-owned.
The tool cannot read, modify or delete other reports. Retrieved source content
cannot supply a report context or grant write access.

Chat orchestration permits one attempt per current user message and removes the tool from later planning rounds, including after failure. Rewritten arguments cannot create conflicting retry progress rows; successful receipts and truthful failures remain available while unrelated actions continue.
