# Website and assistant service composition

`app.js` creates the HTTP application and registers the server-only route files under `src/api`. It receives authentication, configured services and the existing chat runner. `services.js` constructs those services from the existing private configuration and provides website and Discord-chat composition helpers.

The stable launch files remain `server/index.js` for the API and `server/web.js` for the password-gated website. Provider clients, saved data stores and route implementations belong in their own folders. Preserve the existing exported factories, tool catalogues, source permissions and website-only Gmail-send restriction when changing composition.
