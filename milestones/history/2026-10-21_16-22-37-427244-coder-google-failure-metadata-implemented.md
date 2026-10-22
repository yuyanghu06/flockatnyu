# Google failure metadata implemented

- Role/scope: connector coder, safe failure stage/reason/observedHTTP for Gmail/Drive/Calendar/OAuth.
- Files: server/google/oauth.js, client.js, calendar-client.js and new tests/google-failure-diagnostics.test.mjs. No other edits by coder.
- Behavior: frozen sanitized metadata differentiates localvalidation, OAuth, accountverification, ACL, providerrequest andparse. ActualHTTPonly; no body/text/credentials. Existing statuses, success shapes and subscription behavior preserved.
- Verification: final ownedfocused89/89pass; newdiagnostic17cases cover400/403/429/503,localdates,parse,auth,timeout,cancellation/privacy. Earlier combined261run259pass/2concurrentcoreassertionfindings; fixtureunknownnameassertion corrected byparent and tool_failedstatusdictfixedbycore. Scopedwhitespacepass.
- Boundaries: no live/model/source/schema/deploycalls. Parent owns wrappermetadata/guides/journal; new user Calendarlocationreceipt work follows separately in exclusiveclient/chat/batch scope.
