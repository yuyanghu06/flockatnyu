# Application source

Browser code is grouped by responsibility. `app/` composes startup and the map;
`features/` contains the assistant, Contacts and Discord administration screens;
`map/` contains campus data, camera controls, environment models, landmarks and
presence displays.

`api/` contains **server-only** HTTP handlers whose folders mirror URL segments, with one method handler per file. Browser modules
must never import those handlers or service implementations. The assistant's file
validator uses the existing I/O-free `server/chat/attachments.js` contract shared
with the server; credentials and service clients remain server-only.

Each module is formatted with the repository Prettier configuration. JavaScript
files stay at or below 500 physical lines; CSS files stay at or below 400. Split
responsibilities instead of compressing code to meet those limits. `info.md` in
each folder explains its responsibilities and editing boundaries.
