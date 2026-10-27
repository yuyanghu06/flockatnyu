# Markdown prompt migration verification

The migration is complete locally and independently accepted. It changes where
agent/tool instruction wording is stored and preserves the assembled model
requests, structural schemas and execution rules.

## Implementation

- 87 registered Markdown assets under root `prompts/`, grouped by agent, shared
  purpose and tool/service. The retained unused map helper is labeled legacy.
- 355 original source occurrences moved into 353 named text blocks.
- One server-only loader preserves exact block whitespace, uses fixed registered
  paths and replaces explicit named values once as plain text.
- JavaScript retains dynamic context, schemas, validation, authorization, leases,
  versions, budgets, model calls and tool execution.
- Browser attachment validation is separated into a pure contract. Upload UI and
  default user-message text remain browser data; they do not import the loader.
- Source-only packages include only fixed prompt references in reachable modules.
  Frozen evaluation copies include their own Markdown assets.

## Exact preservation evidence

The coders captured current per-file originals before editing, preserving the
concurrent operation-API and chat readback corrections. They then restored each
extracted syntax node and compared the original JavaScript structure.

- Chat: 108 original expressions; 15 restored modules; separately verified pure
  attachment contract/provider formatter split. 28 complete planning/answer
  outputs across 14 conditional scenarios match byte for byte.
- Update agent: 106 original occurrences in nine modules; 18 complete legacy,
  initial and follow-up outputs across dates/timezones match byte for byte.
- Tool services: 141 original nodes in 24 modules; 33 serialized exports and
  catalogues, generated chat map/Calendar schemas and the legacy prompt match.
- Dynamic expressions and original inclusion order remain unchanged.

Temporary source-only comparison evidence: `/tmp/flock-chat-prompt-migration/`,
`/tmp/flock-worker-md-extraction.json`, `/tmp/flock-worker-equivalence.mjs`,
`/tmp/flock-tool-prompt-extraction-records.json`,
`/tmp/flock-tool-prompt-verify.mjs`,
`/tmp/flock-tool-prompt-export-compare.mjs`. These contain synthetic/source
comparison material, not copied credentials.

## Independent offline checks

The tester exercised actual chat/worker runners using simulated services: target
ambiguity, write receipts, attachment handling, failed-source continuation, task
preservation, finish recovery, grouped participation and time bounds.
164 focused behavior checks pass.

26 loader/Drive/package checks pass; a final seven-check rerun includes stronger
actual packaged web/worker imports. They verify missing/extra/inherited values,
unknown paths/blocks, malformed/duplicate assets, exact whitespace, single-pass
substitution, unrelated working directories and exclusion of private Markdown.
Packaged prompt rendering succeeds with an empty environment.

The complete offline command `node scripts/run-tests.mjs` reports 3,033 passed,
five failed and two skipped out of 3,040. The same three unchanged suites run
against the pre-migration source produce the same five failures and 18 passes:

- Three Discord scope fixtures propose an unregistered synthetic tool; the
  operation API rejects it before capturing the fixture principal.
- One pre-aborted Discord summary expects domain coverage on the generic
  aborted response produced before that operation executes.
- One map isolation fixture expects a private capability on a JSON API result;
  the operation API retains that original result privately.

Those existing API/test-contract findings remain separate. Logs:
`/tmp/flock-prompt-migration-all-tests.log`,
`/tmp/flock-prompt-targeted-failures-current.tap`,
`/tmp/flock-prompt-targeted-failures-baseline.tap`.

## Standard checks and review

- Repository format check passes using the isolated locked dev toolchain.
- Repository ESLint passes using the unchanged rules copied into that toolchain.
- Physical file limits pass: 772 modules and four unchanged frozen exceptions.
- API build and frontend build pass; existing frontend chunk-size warning remains.
- Git whitespace checks pass; prompt payload trailing spaces are intentionally
  allowed by a folder-scoped attribute and line endings are fixed to LF.
- Independent evaluator: ACCEPT, no blocking migration finding.

No model/provider calls, live business writes, deployment, commit, push or Docker
engine build occurred in this migration. Byte equivalence establishes preserved
requests; it is not new evidence of model compliance. Existing real-model planner
findings, Calendar/Member Plans verification gaps and the Drive/Calendar
duplicate-check wording conflict remain unchanged.
