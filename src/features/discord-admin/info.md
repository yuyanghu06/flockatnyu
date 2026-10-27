# Discord administration screen

`discord-admin.js` renders channel/source policy administration.
`discord-admin-client.js` calls the existing authenticated admin API and
`discord-admin.css` contains this screen's styles. Server-side permissions remain
in the server-only route and service implementations; the browser grants none.
