# Mixed Miro item pages preserve supported content

- Local timestamp / acting role / milestone: 2026-10-17_13-35-52-655712; coder miro_mixed_items_fix; M27 activation.
- Requested scope: actual board mixed table/page defect, within existing read-only/source constraints.
- Starting repository state: live API connected to authorized board; initial snapshot running; table rows caused whole-page unsupported_content.
- Work performed / changed files: server/miro-tools.js and new tests/miro-unsupported-items.test.mjs only. Root inspected resulting files and updates guides here.
- Decisions: preserve original unknown listing rows/order, recursively merge supported listing/detail originals, metadata-only itemCoverage and citations, truthful partial pages/index with unsupportedTypes. Safe unknown per-item types authorize then disclose unavailable content without detail probing. Supported access failures still discard the page. Oversized required metadata fails context_limit.
- Checks and evidence: coder npm run test:miro PASS33/33 (8new); node --check PASS. Files are untracked, so git diff --check alone is not full whitespace evidence. Independent evaluator is reviewing; live refreshed mixed-page check pending.
- Resulting state / acceptance: implementation accepted for independent review, not final integration. Credentials/config/snapshot worker/schema unchanged by coder.
- Remaining work and handoff: root refreshes API, retests real mixed page; evaluator returns verdict; complete snapshot/readback then daily worker activation. Table cells remain unavailable through REST.
