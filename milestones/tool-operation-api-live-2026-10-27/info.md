# Operation API runtime and live verification

Goal: verify tools → private Hono API → services through real runtime behavior,
production chat/planner runners and separate read-only live provider calls.
The October27 user request explicitly resumed the earlier held testing work.

Scope: all54 operation routes; transport, permission and uncertainty regressions;
representative adapters; bounded configured inference on simulated storage; live
reads using existing grants. No deployment, paid Treg lookup, new permission or
live business write. Broader planner prompt/task-policy changes are separate.

Completion criteria: reproduce/fix API defects, independently retest caller and
state preservation, record actual-model/live results and obtain evaluator review.

Status: scoped API corrections ACCEPTED independently, with17transport scenarios,
379representative checks and83final focused checks passing. Live Gmail, Drive,
Contacts, map and Discord reads succeed. Full planner acceptance remains incomplete:
an actual-model run discarded unmatched-attendee intent. Calendar consent is
missing locally; Member Plans is unconfigured. See [verification](verification.md)
for commands/evidence categories, original failures and next actions.
