# Verbose calendar compact regressions verified

- Local timestamp / acting role / milestone: 2026-10-19T20:03:09.955245-04:00 / tester / general task behavior.
- Requested scope: complete general prompt behavior and reliable timed corrections with relevant links.
- Starting repository state: a23ea47 first release live; promoted full-page size finding recorded separately.
- Work performed / changed files: Added production-client and native regressions for 26 records with 1800-character human notes. Full25 reproduces context_limit; compact25 completes two pages and one batch, preserves notes through full reads, and rejects unknown modes and missing access before OAuth. Tests and tests/info.md changed.
- Decisions: preserve fixed Calendar/source access, identity, revision and existing context bounds.
- Checks and evidence: 45 focused checks passed; diff check passed. No prepatch identity red run claimed.
- Resulting state / acceptance: compact lookup locally accepted; external source data unchanged by verification.
- Remaining work and handoff: finish integration checks, deploy exact reviewed source, verify compact hosted pagination and publish journal.
