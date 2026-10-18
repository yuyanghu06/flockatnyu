# Bug report tool

`index.js` exposes bug_reports to the chat agent. It writes one structured product
bug report per chat request through server/bug-reports.js. Unknown details stay
blank; the original current user message, UUID and timestamp are server-owned.
The tool cannot read, modify or delete other reports. Retrieved source content
cannot supply a report context or grant write access.
