# Thin map tools

`index.js` exports the unchanged `MAP_TOOLS` catalogue and constructs a private
API client. `chat.js` constructs the chat-specific client and retains the pure
`normalizeChatMapPersonName` compatibility export. Neither file reads the map,
resolves a person, validates a write snapshot or owns request caches.

Execution goes through the private Hono operation endpoint, then
`server/map/operations` and the existing map service/store. The factory unwraps
its own lower-map client before constructing the backend chat wrapper, so one
operation does not recurse through another thin tool. Private read capabilities,
actor bindings, snapshots, optimistic versions and source checks remain on the
server. No provider-original fetch or Calendar synchronization is added.

See the backend operation folder guide for detailed preservation rules.
