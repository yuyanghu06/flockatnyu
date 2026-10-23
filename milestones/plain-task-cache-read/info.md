# Plain task-cache reads

Goal: read temporary saved tasks without rereading their live sources as part of the cache operation. The model chooses normal Discord/Gmail, Calendar and map tools afterward.

Preserve service-only storage, current scoped task visibility, expiry/leases, exact task versions and normal action-tool checks. No cap, timeout or schema redesign. Completion requires implementation, independent tests/review, API build and a documented combined worker release with tool-error continuation. Status: complete.


Completed and deployed in worker1c33c414-dd44-4f51-b28e-09ca24663544. Independent simulated behavior checks and review accepted; API build, scoped broad regression and sanitized package checks pass. Real startup/preparation ready verified; a full live task cycle and performance/cost/backlog impact are not yet established. See the rolling milestone for the exact receipt and remaining separate argument/deadline work.
