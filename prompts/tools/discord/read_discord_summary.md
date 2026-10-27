# read discord summary

## description

<!-- prompt: description -->
Summarize all authorized eboard channels over a requested window in one bounded live scan. FIRST choice for broad Discord updates. Default scope=eboard; general is secondary fallback and excludes teams; team requires an explicit user request. For one requested team channel, supply scope=team and the exact channelId resolved from list_discord_channels; only that channel is read. Defaults to last seven local calendar dates when from/to omitted. Inspect per-channel coverage; no claim of complete server or thread coverage.
<!-- /prompt -->

## parameters.channelid.description

<!-- prompt: parameters.channelid.description -->
Optional exact channel ID from the live catalogue; allowed only with scope=team. Never guess IDs.
<!-- /prompt -->
