# Long Discord message cannot be fully read through current tools

- Local timestamp / acting role / milestone: October26,2026,9:46PM NewYork / read-only Planner / manual pending work.
- Requested scope: explain a live read that omitted the tail of a complete2555-character queued original.
- Starting repository state: source425fda5 pushed; fragment reader/schema remain held.
- Work performed / changed files: planner inspected live retrieval, fragment formatting and freshness checks only. Root records the report; no source/provider calls, environment/request reads, source archives or code changes.
- Decisions: do not invent fragment IDs or claim a live prefix plus earlier cached tail is a complete fresh read. Retain the actual truncation blocker.
- Checks and evidence: discord/live-retrieval.js23–29 caps every excerpt at1800UTF-16characters with12000total; exact reads at202–223 use that cap. Window projection313–320 strips its internal full messages and returns the same excerpts. Context/limit do not expose text offsets/full-message retrieval. bounded-result.js24 only fragments the already serialized result; cropped source text is gone before that step. Participation freshness at automation/adapters.js798 rejects textTruncated; observation registration869 still retains truncated sources, so receipt existence is not full-body proof.
- Resulting state / acceptance: current exposed reads cannot recover the missing tail. Full queued content remains earlier authorized evidence, explicitly distinct from the partial fresh read. No reader or schema fix performed.
- Remaining work and handoff: source-message completeness/continuation needs separate review; keep this issue distinct from previously reproduced nonexistent global result IDs and active conversation growth.
