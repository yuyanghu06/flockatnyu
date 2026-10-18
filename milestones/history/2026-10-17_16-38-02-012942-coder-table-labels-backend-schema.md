# Table labels backend schema

- Local timestamp / acting role / milestone: 2026-10-17T16:38:02.012942-04:00; coder; map-presence-labels.
- Requested scope: stored JSON labels and verbatim backend response.
- Starting state: applied021/022 unchanged; legacy entries lack label.
- Work performed: backend coder added023, changed only validator plus ordered missing-label backfill; APIlabelpassthrough, fixture script explicitlabelTest and owned guides. No cloud operations/tests.
- Decisions: exactlysevenstringfields, label0–200Unicodecodepoints; status remains operational only; source fixture check internal authorization, not presentation. Prior validation/locking/timestamp/ACL boundaries retained.
- Checks/evidence: twoJSsyntaxchecks, APIbuild, exactvalidatorcomparison exceptintendedlabelchanges and scopedwhitespace PASS.
- Resulting state: readyforindependentSQL/API checks and primaryapplication.
- Handoff: parent hostedapply/CASlabels, frontendintegration and journal.
