# Shared chat budget increase

Website and Discord shared chat now support30planning rounds and30executed tool calls in source, preserving2calls per round and existing source, timeout and context guards. Independent tester137checks and reviewer263checks pass; API/frontend builds pass. Source commit89a7730. Web release package has262files with exact-source/private-value checks passed.

Discord timeout300000ms is saved on web and discord-events, but activation and30call release are blocked by Railway deployment pause on October21. Both web upload and collector existing-image redeploy returned “Deploys have been paused temporarily.” Running services remain on prior releases. Resume reviewed web rollout and collector timeout activation after recovery; verify health and promoted frontend. Autonomous update agent is unchanged.
