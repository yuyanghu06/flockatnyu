# Cleanup handoff and parallel ownership

M36 collector/archive retirement and M37 tool organization are the cleanup boundary. Current acceptance and evidence are in ../milestones/milestone.md. The working tree contains substantial uncommitted pre-existing work: do not reset it, bulk-stage it or infer ownership from Git status alone.

| Workstream | Primary files | Shared boundary |
| --- | --- | --- |
| Map and UI | src/ and focused map/browser tests | Coordinate assistant.js, chat-client.js, shared CSS and API shapes with agent work. |
| Chat agent, update agent and prompting | server/automation/, server/providers/, tools/ and focused backend tests | server/app.js, server/index.js and assistant transport contracts need one owner per change. |
| Source ingestion | server/discord/, server/google/, server/miro/ and deployment/ | Keep collectors independent of callable tools/model runners. |
| Build and deployment | scripts/, package.json and locks | One integrator owns dependency/script changes. |
| Tracking | milestones/, current shared guides | Serialize updates through the integrator; history/evidence are append-only. |

Existing read tools are centralized in tools/{discord,google,miro}. No empty Calendar/memory folders imply future functionality. finish_batch remains an internal automation control. Connector clients and source authorization remain under server/. Existing developer/asset/deployment commands now use scripts/; npm command names are unchanged. Slim collector runtime modules are byte-identical across this move, so this pass needs no collector redeployment.

Follow-up product work: prompt and scoped memory design, Calendar access/operational verification, map adapters, chat agent/update agent deployment, production member authentication, Miro authorization/initial capture. Gmail collection and model execution now have independent enable switches. These are separate workstreams, not additional cleanup prerequisites. Native Discord edit/delete and excluded-channel/thread probes remain unverified on hosted services; local fixtures cover them. Admin browser fixture was updated but not run. Invalid/expired Gateway sessions can leave gaps without backfill.
