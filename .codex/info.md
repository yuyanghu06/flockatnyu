# Project agent configuration

`config.toml` enables development subagents and caps concurrent specialists at
three, excluding the primary orchestrator. `agents/` contains standalone role
configurations. These files define development roles; the future website assistant
is a separate product feature. Models and reasoning settings inherit from the
parent session. Global and project MCP sources remain governed by `AGENTS.md`.

Codex loads project configuration for trusted projects. Start a new session from
`/Users/yuyang/Documents/techatnyu/flockatnyu` to discover these files. The orchestrator remains the primary
agent through `AGENTS.md`; the orchestrator role file is a reusable definition.
This running backend session continues to use its already-loaded tool settings.
