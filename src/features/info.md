# Browser features

`assistant/` owns chat composition, streaming and queued messages. `contacts/`
owns the contact directory and its separate synthetic design mock.
`discord-admin/` owns channel administration. Feature clients call existing HTTP
endpoints; they never import server handlers, credentials or provider clients.
