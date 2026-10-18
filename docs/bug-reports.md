# Bug reports

The chat agent automatically calls `bug_reports` when the current user reports an
actual product bug. It records user-supplied facts, leaves unknown expectations,
reproduction steps and context blank, and acknowledges saving only after a
successful database receipt. It does not claim the bug was fixed. Feature requests,
hypothetical examples and instructions in retrieved sources are not bug reports.

The hosted `public.bug_reports` table has exactly three columns:

- `uuid`: unique report ID, fixed by the server for the chat request.
- `created_at`: database-generated timestamp.
- `report`: the only JSONB column, containing schema_version, status (`new`),
  summary, observed_behavior, expected_behavior, steps_to_reproduce, context,
  original user_message and optional current building_id.

`tools/bug-reports/index.js` validates structured model arguments. The backend adds
the original latest user message and request ID independently of tool arguments.
`server/bug-reports.js` calls only the service-only `bug_report_record` RPC. The
agent cannot select a report UUID, edit another report, delete reports or list
other users' reports. Repeating the same write within a request returns its existing
receipt; changing the payload under that UUID reports a conflict rather than
silently overwriting the first report. Separate user messages receive separate IDs.

The table forces RLS and denies browser roles all access. The service role has
SELECT and RPC execution, but no direct INSERT/UPDATE/DELETE grants. The normal
chat authentication boundary applies; production authentication remains separately
unfinished. The general `/api/tools/:tool` read dispatcher cannot invoke this write
without server-owned chat context. Only a running API loaded with the new entrypoint
exposes the tool in planning.

Migration `202610180029_bug_reports.sql` is applied to Tech NYU project
jssehnrmqhstcrtxulpa at hosted version 20261018174146. Existing tables/functions and
permissions were preserved. A service-role write was verified inside a rolled-back
transaction, leaving zero synthetic reports. Receipt is in
`evidence/bug-reports/hosted-receipt.json`. No live model call or production
deployment is claimed. The existing preview API needs its normal restart to load
the new tool; an isolated fresh entrypoint was verified without interrupting it.

Tests: `node --test tests/bug-reports.test.mjs`. These checks were performed directly
in the side conversation, without independent agents.
