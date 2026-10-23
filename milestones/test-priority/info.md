# Essential test review

Goal: classify the accepted 2,353 individual-case snapshot by current product importance, using actual assertions and relevant runtime behavior. The Discord, Calendar/map/worker and platform assignments were reviewed separately; the orchestrator validated the complete combined result.

Complete: 1,627 essential, 548 useful, 139 protected historical and 39 requiring retirement review. All 2,353 IDs appear exactly once across 169 baseline files, parents excluded; protected historical counts match every file. Essential means direct current access/privacy/identity, correct writes, retained work, truthful outcomes, bounded execution and main user flows. It does not establish a minimal sufficient suite.

See ../../docs/test-priority.md and ../../docs/test-priority.csv for the complete recommendation and reasons. No tests, runtime or external sources changed; no new execution/model/API evidence was generated. Concurrent work is separate. No required review work remains; possible retirement candidates require individual proof before removal.
