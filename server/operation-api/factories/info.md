# Operation API construction

Each factory constructs one backend domain service, then binds its fixed operation
names to the private API. Thin tool modules import these factories. Execution and
private request state remain in `server/<domain>/operations`.

Google combines raw Google and Calendar services before binding; map unwraps its
own base client before creating the chat service. These prevent nested API calls.
Memory and Miro use trusted aliases for compatibility lifecycle helpers while
sharing the original session. No factory opens a port or contacts a provider at
construction time. Preserve existing constructor interfaces and independent
service access checks when adding an operation.

The Attio factory supplies its complete trusted catalogue separately from its
currently exposed tools, preserving forbidden results for disabled write
operations through request-specific sessions. This never grants a hidden tool.
