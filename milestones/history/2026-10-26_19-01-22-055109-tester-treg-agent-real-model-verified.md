# Treg agent tools real-model behavior verified

- Local timestamp / acting role / milestone: 2026-10-26T19:01:22.055109-04:00 / tester / treg-agent-tools
- Requested scope: Expose separate Treg people-search and array-email enrichment chat tools.
- Starting repository state: Existing unrelated work and Gmail-enrichment changes preserved; Treg clients existed outside chat tools.
- Work performed / changed files: Independent tester completed10offline behavior groups plus6scripted harness mechanics and actual configured gpt-6-luna scenarios through production chat, Treg clients/tools and simulated Contacts/Treg transports. Additional tag checks confirm unchanged Gmail default, explicit chat tag and blocked invalid label.
- Decisions: Lookup-only, separate calls, no Contacts/cache writes; six supported explicit string fields; raw full-call logs stay private.
- Checks and evidence: All six intended model cases pass across21actual inference requests (18initial plus3discovery-only correction), within28overall cap. Cases: external discovery; ordered match/miss/error array; unavailable Treg; saved-only Contacts; missing-email clarification; malicious provider text with do-not-save. Zero proposed/attempted/applied Contacts writes; exact saved state preserved; actual returned fields reach both model stages; production hashes stable. Evidence: evidence/treg-agent-tools/final-tester-report.json and both referenced private reports. Original discovery false assertion is retained: it required workplace for a names/emails request. Only assertion corrected and discovery repeated. Later harness change only adjusts optional scripted canned answer; live-model path and production bytes unchanged, final test hashes recorded.
- Resulting state / acceptance: independent tester PASS; final review pending
- Remaining work and handoff: Record final evaluator decision, confirm final hashes/whitespace and integrate completed local milestone with live-release limits.
