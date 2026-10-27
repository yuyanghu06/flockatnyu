# Shared server configuration and time helpers

`config.js` validates existing model/runtime environment settings without changing their defaults. `source-timeout.js` supplies the current shared source-operation timeout constants. `time-zone.js` validates timezone names and constructs the clock context used by chat and API tools.

These small helpers are used across server services and tools. They do not fetch sources, perform business writes or grant source access. Keep provider credentials server-only and preserve existing bounds, defaults and timezone behavior when editing them.
