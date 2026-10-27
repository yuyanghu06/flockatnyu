# Discord operations behind the private API

`reads.js` contains the four live-read declarations, argument validation and
routing to the existing authorized Discord service. It exports
`validateLiveDiscordArguments` for backend callers that need the same pure checks.
`live-summary.js` adds only the named bounded summary operation, using these
backend reads directly. `draft.js` holds trusted Discord actor/source checks,
current target authorization and read-only draft generation.

The private operation API dispatches here; thin clients under `tools/discord`
only construct API clients and preserve public exports. Keep backend dependencies
pointing to this folder rather than importing those thin clients. Do not change
source access, explicit team scope, local time windows, summary budgets or the
no-send draft guarantee while reorganizing these files.
