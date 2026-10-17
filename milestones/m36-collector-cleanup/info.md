# Collector cleanup

M36 removes obsolete Discord archiving runtime, keeps live assistant reads, and packages independently deployed Discord/Gmail ingestion against shared Supabase. The live listener covers eligible guild channels except blacklisted channels/categories and descendant threads. Acceptance requires independent runtime/SQL tests, review and verified hosted cutover. Current status and remaining work live in ../milestone.md. Applied migrations and historical evidence are preserved.

Configured rollout accepted: final independent evaluator verified both services and controlled resumable restart. Native hosted edit/delete and blacklist probes remain separate pending checks.
