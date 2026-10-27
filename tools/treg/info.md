# Thin treg tools

`index.js` exports the unchanged Treg tool catalogue, constructs a private HTTP
operation client and re-exports pure field/usage projection helpers for existing
callers. It makes no paid request, stores no native result and owns no request
cache or logging callback.

The common private Hono endpoints dispatch into
`server/treg/operations/service.js`, which uses existing Treg clients. Request
scopes, paid-call replay protection, native result records and private logging
remain below that boundary. JSON results contain only supported projections,
usage and existing resultIds. Saving still requires the separate Contacts import
operation; no cache/Gmail write or new model-callable name is added.

See the backend operation folder guide for detailed preservation rules.
