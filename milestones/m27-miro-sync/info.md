# M27: daily Miro board synchronization

Goal: a dedicated daily Railway worker, Supabase board snapshots and authorized
live assistant reads for the club calendar. Miro access is read-only; preserve
original REST objects, source links, layout/relationships and freshness. Shared
backend source scope and service-only database permissions are required.
No model calls or embeddings are needed for sync; no board writes are authorized.

Complete when local failure/SQL tests and independent review pass, the isolated
schema/service are deployed, and configured real-board snapshots are verified.
Record a natural scheduled invocation separately from manual capture success.

October17 activation: private app installed with boards:read, exact schedule
board/team configured, real preflight and protected live API checks verified.
Mixed unsupported objects now retain metadata with explicit partial coverage;
native table cells remain unavailable. Independent updated Miro tests33/33 and
provider/schema compatibility checks pass. First snapshot is in progress and
scheduled worker enablement remains pending its verification. Orchestrator owns
secure configuration, cloud changes and the shared journal; see the rolling
snapshot and evidence receipts for current operational truth.
