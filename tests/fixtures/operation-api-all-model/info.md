# Operation API model verification fixtures

`chat-runner.mjs` provides the unchanged production chat runner and configured
inference provider to the live provider check groups. It tracks actual selected
model tool names separately from execution results and stores source-free
reports. Provider adapters must enforce their own authorized live-operation
scope. The model fetch adapter accepts only exact configured inference endpoints.

The shared inference ledger is
`evidence/tool-operation-api-all-live-2026-10-27/inference-ledger.json`.
Atomic reservations cap all groups/reruns together at 96 requests. Root assigns
fixed group caps; the helper never resets a group or the global count.

The worker fixture modules use the production handler, private operation API,
Calendar clients, source readers and map/task services with synthetic provider
transports and in-memory state. They cover club schedule changes, personal plans,
attendance, unfinished task preservation and context fragment continuation.
Actual model replies are never scripted or forced. Setup calls and automatic
runner synchronization are recorded separately and do not count as selected
model operations.

Run `tests/operation-api-all-model.mjs --self-check` without environment files
and with the network-deny preload for offline fixture mechanics. The explicit
`--live-model` switch additionally requires the orchestrator's source-freeze GO.
That run uses the existing configured inference credentials privately; it does
not read or mutate live business services. Its outcomes are separate from the
other groups' real provider checks and from deployed-worker acceptance.
