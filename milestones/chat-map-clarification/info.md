# Chat map updates — corrected scope

Goal: existing chat map tools should execute requests to plot someone or current-location statements such as “im at bobst,” asking only when person or essential details are unclear. Natural-language intent is a model decision, without a backend phrase parser or source-proof workflow.

The prior separate resolver/save modules, grammar, pending cache, session HMAC and dedicated tests were rejected and removed. The existing tools/map/chat.js adapter supports verified Discord actor or supplied-name lookup, fills omitted internal attribution and dispatches through normal event validation. The Discord-to-person mapping remains in prompts and is attached when map tools run. Existing authentication, catalogues, field/revision checks and provider/worker permissions remain separate.

Status: corrected existing-tool implementation accepted locally.394parent regressions,217independent tester checks and56evaluator checks pass; API build/whitespace pass and evaluator ACCEPT. Actual runtime native/legacy saves, tool-time identity mapping and map projection use synthetic evidence. No real-model, hosted mutation, deployment or visual claim. Previous separate-flow acceptance is historical and superseded. Current truth stays in ../milestone.md.
