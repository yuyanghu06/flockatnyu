# Calendar-only attendance stop condition needs correction

- Timestamp / role / milestone: 2026-10-22T20:29:12.737504-04:00 / evaluator / contextual-event-attendance.
- Starting state / scope: First frozen3file prompt candidate over deployed a87; independent read-only review.
- Checks: All276packagefiles compared, exactly3promptfiles differ and current hashes match; syntax/whitespacepass;8existing scripted production-tool checks pass. Natural attendance and historical entire-time configuredmodel checks pass with correct3–5PM inheritedhours.
- Finding: Configuredmodel Calendar-only case proposed two new scheduled_event upserts despite complete empty authorized mapread; backend blocked invalid_request/forbidden, zeroappliedwrites. Promptbehavior violates contract. Ambiguity firstfixture was inconsistent and inconclusive; remainingcases hit36requestevaluationcap.
- Verdict: REQUESTFIXES; not deployed. ExactcurrentmapUUID must be required for existing-event attendance; Calendar-only muststop writes and report unsaved attendance. Coder correcting onlysame3files; meaningful retests within revised56totalinference ceiling. No businesswrites by these evaluations.
- Additional repair verification: OriginalGoGreekattendance application projection initially omitted the transferred relation because parent used customdomain instead of exact serverPUBLIC_ORIGIN for chat attribution. Parent corrected the one exact relation to configured origin throughMCP; map/presence now verifies upcoming3–5PM at683Broadway. No originaleventtiming changed.
- Remaining: Freezecorrection, independentmodelretest/finalreview, webrollout and live disposableattendance/cancellation/cleanup.
