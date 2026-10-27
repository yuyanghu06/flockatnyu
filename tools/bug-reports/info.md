# Bug report tool client

`index.js` preserves the named bug-report tool and constructor while sending its
execution through the private operation API. The backend operation in
`server/knowledge/operations/bug-reports.js` validates the current user context,
uses the server-generated report ID, bounds the saved report and invokes the
existing report store. The tool cannot choose another user's message or report
ID through its JSON arguments. The runner's existing once-per-message rule and
the store's report identity remain unchanged. Recording a report does not fix it.
