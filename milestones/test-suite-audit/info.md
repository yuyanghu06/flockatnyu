# Repository test-suite audit

Goal: count repository-authored tests, explain their coverage, distinguish retired-feature checks from current guards and identify safe cleanup. Scope includes Node tests, standalone browser/geometry/model harnesses and test-support fixtures. No application or test changes, live model/source calls, deployment or deletion.

Acceptance: reproducible counts with grouping/skip distinctions, high-level coverage inventory, evidence-backed legacy/deletion recommendations and actual check outcomes. Status: audit complete and independently accepted. The pre-cleanup inventory was 2,459 individual Node cases/168 files, plus 40 parents; broad and focused verification reports two stale failures and one optional skip. 54 standalone programs are inventoried separately. No tests were changed/deleted. See ../../docs/test-suite-audit.md and its CSV. Current results belong in the rolling milestone and final documentation report.

The user subsequently authorized cleanup; see ../test-suite-cleanup/info.md and ../../docs/test-suite-cleanup.md for current structure/counts. The original audit and CSV remain before-cleanup evidence.
