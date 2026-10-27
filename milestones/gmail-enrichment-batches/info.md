# Daily cache email batches

Cap each daily enrichment batch at 50 emails, processed one at a time, and pause five seconds between successful batches. Continue until pending work is empty or existing spending/error limits stop the run. This is a per-batch cap.

The Tomba → Apollo policy, raw cache, native Contacts, source checks, lease, deadline and 9 AM New York schedule stay unchanged. Implementation, independent local tests, isolated Gmail-only release and read-only hosted acceptance are complete. No production test rows, paid manual run, CSV rerun or website/schema changes were needed. Current release and evidence links live in the rolling milestone.
