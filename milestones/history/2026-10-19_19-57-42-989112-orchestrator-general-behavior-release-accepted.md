# General behavior release accepted

- Local timestamp / acting role / milestone: 2026-10-19_19-57-42-989112 / orchestrator / general task behavior and timed corrections.
- Requested scope: finish the tested behavior/Calendar/citation repair and prepare its live release.
- Starting state: implementation frozen with independent, model and browser acceptance.
- Work performed: reviewed final files, collected complete regression/build outputs and prepared exact-source sanitized deployment contexts. Private environment values were scanned only in memory and were not exposed or packaged.
- Checks and evidence: final full suite 1649 tests: 1648 passed, one existing optional official-Miro-schema skip, zero failed. Initial full run had only three obsolete footer assertions; the corrected 16-case frontend/Markdown/burst suite passes. Independent Calendar test suite 137 and final timing-receipt 33 pass; evaluator 119 main/39 subset checks pass. API/frontend builds pass. Four configured-model/full-28-tool scenarios and desktop/mobile visual checks pass as recorded previously.
- Decisions: preserve fixed account/Calendar grants, fresh revisions, exact selected IDs, unsupported event restrictions, no guest notifications and existing outer limits. Timed weekly schedules expand into finite instances; RRULE creation remains unsupported. Shared general behavior applies to website/Discord chat, without granting the unattended planner user-directed write authority.
- Deployment preparation: web 261 files, update-agent 54 files; both packages match source and pass private-value scans. Worker release carries shared Calendar read/PATCH fixes only; chat-only batch tools remain separate.
- Resulting state: accepted for deployment and source publication. No original request replay or verification business-source writes.
- Remaining work: promoted access/catalogue/query/model/frontend checks and publication of actual live receipts.
