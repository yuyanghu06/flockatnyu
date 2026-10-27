# Thin contacts tools

`index.js` exports the unchanged Contacts metadata/field constants and constructs
a private HTTP operation client. It contains no store dispatch, private snapshots,
import loops, logging callbacks, receipt cache or uncertain-write state.

The common private Hono endpoint dispatches into
`server/contacts/operations/service.js`, which uses the existing saved Contacts
store. Exact reads, native-field preservation, actor/version checks and replay
protection remain there. Native Treg records and append callbacks stay in the
trusted server request context; only resultIds cross the JSON request boundary.
Lookup and Contacts importing remain separate model-selected operations.

See the backend operation folder guide for detailed preservation rules.
