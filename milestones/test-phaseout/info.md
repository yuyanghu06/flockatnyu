# Further test phase-out

Goal: retire overlapping prompt/text/catalogue/contract checks while preserving meaningful actual behavior and 139 protected historical cases. Scope is tests and documentation; other attendance/prompt runtime work is preserved and attributed separately.

Complete:32registered cases removed across eight files, zero new cases or parent groups. Mixed serialization/configuration/request-delivery tests retain their behavior after prose assertions were trimmed. The source-compaction case now verifies actual size reduction and exact data preservation instead of an incidental old percentage.

Current inventory:2353individual cases plus40parents,2393reported results across169files. Independent frozen-source full run:2392pass,0fail,1optional skip,81.245seconds. All139historical cases and43migration files preserved. Evaluator and independent tester ACCEPT; web/API builds and whitespace checks pass. See ../../docs/test-phaseout.md and its current CSV. Earlier failed measurement and attendance receipts remain historical; no current failure remains from those reruns. No required work remains for this test phase-out.
