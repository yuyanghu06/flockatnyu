# Today treg contact records diagnosed

- Local timestamp / acting role / milestone: 2026-10-27T10:49:03.513256-04:00 / orchestrator / treg-contact-diagnosis.
- Requested scope / starting state: Read live Contacts and exact import receipts via Supabase MCP; no business mutations or paid requests. Existing dirty worktree preserved.
- Work performed / changed files / decisions: Two native BlitzAPI records imported today around 09:05 New York. Both have person.first_name/person.last_name, no email field anywhere in the saved provider body. Exact corresponding original emails remain in contacts_cache via completed import receipts. User authorized future separate lookup_email storage and restoring these two existing emails. Concurrent daily Apollo-provider work remains separate.
- Checks and evidence: Read-only hosted SQL confirms completed hit/imported receipts, native shapes and original-email join. Railway deploy logs confirm scheduled container start; private payload log not retrieved. Planner/source results corroborate cause.
- Resulting state / acceptance / remaining work: Implement/test native projection and new schema without touching cache/raw JSON; repair only exact authorized two contacts after independent review.
