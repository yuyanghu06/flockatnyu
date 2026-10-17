# m26-google-connector

Prepare Gmail/Drive read-onlyruntime connectors and secureGoogleOAuth for oneclubaccount; accountconsentpendinguser.

Status: planned,implementationinprogress. Completionrequires independentfixture/integrationtests,evaluation,and actualverifiedrolloutwithinuserauthorization. Preserveexisting sourcepermissions,legacyresultsandunrelatedmap/frontendwork. Currenttruth/evidence belong inrollingmilestone.


Read-only Gmail/Drive runtime and consent helper are implemented and independently accepted. No Google account has authorized access. Complete OAuth client setup/consent per docs/google-connector.md before claiming connected access; private account data cannot be authorized by a plain API key.
