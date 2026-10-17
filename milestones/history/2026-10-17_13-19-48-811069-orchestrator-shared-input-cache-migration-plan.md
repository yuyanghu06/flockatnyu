# Shared input cache migration plan

- Local timestamp / acting role / milestone: 2026-10-17_13-19-48-811069; orchestrator/planning; M33.
- Requested scope: write migration for two-column cache shared by Discord, email and other source responses. User also accepted hybrid future agent trigger.
- Starting repository state: extensive dirty work preserved; migrations001-017 documented applied and immutable, proposal only for cache. Latest history two-column discussion read.
- Work performed / changed files: inspected startup state, workflow/role configs/templates, migration guide and SQL access conventions, PGlite test availability. Defined exclusive coder migration/guide files and independent tester/evaluator sequence. Created M33 folder guide and updated journal.
- Decisions: public.agent_input_cache(uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),raw_response JSONB NOT NULL), generic JSON without provider-specific checks. Transactional migration, forced RLS, explicit table grants restricted to service CRUD, no client policies. Schema only; no automatic source reads, cleanup, model schedule or cloud changes. Proposed future cadence accepted: five deduplicated updates OR oldest five minutes; one-minute cooldown and one run, no empty LLM calls.
- Checks and evidence: read-only repository status, SQL/reference/test inspection. No app tests or live SQL executed at planning stage.
- Resulting state / acceptance: bounded plan accepted for implementation; coder assigned actual collaboration role and exclusive files, no false native config claim.
- Remaining work and handoff: inspect coder output, journal pass, independent PGlite testing, read-only evaluation, integrate docs and whitespace checks. Hosted migration remains unapplied unless separately requested.
