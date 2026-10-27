# Contact clarification and Calendar completion verification

Both original actual-model failure reproductions now pass. Independent review
accepts the scoped prompt changes and their bounded verification. This is a
local prompt correction; no backend behavior or production deployment changed.

## Wording changed

Nine Markdown files, using eleven existing blocks:

- `prompts/tools/contacts/chat-workflow.md` and the search/read/update/delete
  descriptions resolve the user's intended person before selecting a candidate
  UUID. Ranking, a model-chosen read and the desired new field value cannot
  resolve a name ambiguity. Unresolved single-person actions stop for a focused
  question. Explicit selectors and actual clarification preserve the pending
  change and permit normal exact-read/versioned writes. Read-only multi-person
  comparisons and unrelated clear actions remain available.
- `prompts/tools/calendar/chat-workflow.md`, `list_calendar_events.md`, and
  `prompts/agents/chat/{policies,planning}.md` complete a read after complete
  empty coverage. A filtered empty result is query-specific; an unfiltered empty
  window also covers contained narrower queries. Cosmetic query/mode/limit
  changes cannot restart that completed read. Partial and failed results remain
  qualified; needed coverage, pending writes and fresh reads remain distinct.
- Both routing passages now honor an explicitly selected Calendar. For a general
  schedule question without a named source, empty/unavailable Calendar triggers
  separate actual Miro content reads when the read tools are registered. Missing
  Miro tools permit an honest answer without another Calendar scan.

Three JavaScript assembly comments were refreshed; runtime logic is unchanged.
Block identifiers, placeholder sets and assembly separators are unchanged. No
schema, source/identity permission, backend gate, tool composition, worker cycle,
execution limit or unrelated Drive duplicate-check correction was added.

## Actual configured-model checks

40 new `gpt-6-luna` inference HTTP requests tested eight case-groups, including
actual two-turn clarification and separate partial/unavailable conversations.
The maximum was64 total and10 per group; the largest group used9. All responses
were HTTP200. No cap stop or business-network request occurred.

| Case-group | Requests | Outcome |
| --- | ---: | --- |
| Same-name workplace update | 3 | Strict pass: search then clarification with both candidates; zero candidate-specific reads or mutations. |
| Same-name delete | 3 | Strict pass: clarification before any candidate read or mutation. |
| Actual clarification then email selection | 8 | Strict pass: first answer asks; the user's rae2@example.com reply resumes the pending edit. Only the second record changes, with its exact version; first record and opaque fields remain. |
| Clear exact-email workplace update | 5 | Strict pass: one requested field changes; nested legacy values and the other record remain. |
| Original complete-empty DST Calendar failure | 3 | Strict pass: one correct25-hour listing, no repeated queries and an honest final answer. |
| Explicit6–8PM empty Calendar | 3 | Accepted through semantic review: one complete empty whole-day read supports the final answer restricted to6–8PM. Strict oracle expected identical narrower read bounds. |
| Partial coverage and unavailable Calendar | 9 | Accepted through semantic review: one unnecessary filtered same-window probe precedes complete unfiltered AM/PM reads; their union covers the requested day and reveals/cites both events. Separate unavailable conversation makes one failed read and reports it honestly. Strict oracle required every refinement to narrow the time window. |
| General schedule Calendar-to-Miro fallback | 6 | Strict pass: Calendar empty, then board navigation and actual mocked native canvas content; final event/time/place and canonical item citation are supported, with board coverage qualified. |

The raw report has six strict passes and two retained strict assertion failures.
Independent semantic review accepts those two outcomes with the qualifications
above. No blanket strictly green raw result is claimed. The extra partial-window
probe is a remaining efficiency limitation, not the prior repeated-read loop
after complete empty coverage.

## Evidence, boundaries and checks

Private ignored evidence (directory0700/files0600):
`evidence/prompt-tightening-2026-10-27/2026-10-27T22-56-33-168Z/`.

It preserves `report.json`, `semantic-review.json`, request ledger, fixture
preflight, full proposed arguments/tool outcomes, before/final states, exact
write arguments, actual model replies and source pins. Original50-request failed
verification evidence remains unchanged in the separate prompt-markdown-live
milestone.

397 frozen application/fixture/driver/control files include all87Markdown assets.
Hashes stayed stable and relevant workspace drift was empty. Compared with the
prior failing freeze, production changes are exactly nine Markdown assets and
three assembly-comment edits. Only the exact configured inference endpoint/model
was allowed; redirects, direct HTTP and other network paths were fenced. Actual
production runners/adapters used simulated sources/storage and a mock native
Miro client; no real business reads/writes or MCP connection experiment occurred.

Additional checks: all87assets and six representative chat prompt assemblies
validate;106 focused offline runner/Contacts/Calendar/Miro/Drive/loader checks
pass; repository formatting, lint, physical line limits and API build pass.
No UI or backend logic changed, and no deployment/commit/push occurred.

Independent evaluator: ACCEPT for this scope. These bounded samples support the
selected corrections; they do not guarantee all future model behavior or verify
production deployment. Real-service task checklist statuses remain unchanged.
