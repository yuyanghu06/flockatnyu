# Compact calendar identities implemented

- Local timestamp / acting role / milestone: 2026-10-19T20:03:09.954457-04:00 / coder / general task behavior.
- Requested scope: complete general prompt behavior and reliable timed corrections with relevant links.
- Starting repository state: a23ea47 first release live; promoted full-page size finding recorded separately.
- Work performed / changed files: Implemented optional full/default and compact identities result modes in Calendar schema, client and adapter. Compact provider fields omit descriptions and metadata; exact IDs, timing, status, links and pagination remain. Bulk updates retain full fresh reads and hidden ETags; context limits unchanged. Updated prompts and owned guides.
- Decisions: preserve fixed Calendar/source access, identity, revision and existing context bounds.
- Checks and evidence: 32 focused checks passed; syntax and diff checks passed.
- Resulting state / acceptance: compact lookup locally accepted; external source data unchanged by verification.
- Remaining work and handoff: finish integration checks, deploy exact reviewed source, verify compact hosted pagination and publish journal.
