# Miro optional group totals corrected

- Local timestamp / acting role / milestone: 2026-10-17_13-54-56-054880; coder miro_mixed_items_fix; M27 activation repair.
- Requested scope: root review correction for item-based group pagination totals.
- Starting repository state: group merging/identity repair implemented, optional total still compared to uniquegroups.
- Work performed / changed files: server/miro/snapshot.js and tests/miro-group-pages.test.mjs only.
- Decisions: total must remain consistent across pages and match raw membership entries represented by slices. A total alongside legacy fragments without membership arrays fails ambiguous_group_total. Observed API size remains fragment count; ordinary duplicate guard unchanged.
- Checks and evidence: coder focused10/10 and npm run test:miro43/43 PASS onNode25.8. Root has a real all-group structural diagnostic running underNode22.12; independent evaluator now verifies all Miro tests on that minimum runtime.
- Resulting state / acceptance: focused implementation correction accepted for independent verification. No new source/schema/config scope.
- Remaining work and handoff: require independentNode22 ACCEPT and actualgroupdiagnostic before full retry, then hosted deployment/activation.
