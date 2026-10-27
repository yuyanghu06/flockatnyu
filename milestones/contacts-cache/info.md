# Gmail inbox Contacts cache

Incoming Gmail INBOX senders go first to a private contacts_cache staging table. Its only columns are id UUID, created_at timestamp containing date and time, and raw_input JSONB containing email and optional name. No Gmail bodies, source IDs or direct writes to the Contacts CRM belong here.

Preserve existing authenticated Gmail notification/history/queue behavior. A separate idempotent cache step filters incoming eligible senders and retries safely before cursor advancement. No outbound capture, historical import, promotion into Contacts or automatic cleanup is included. Apply only migration049 and release only the Gmail collector after independent SQL/behavior/package review. Current state lives in ../milestone.md.

Complete and independently accepted:049hosted20261026215743, Gmail recovery239293adSUCCESS/health200/webhook401. Actual intake observed7email/name-only cache rows with Contacts0unchanged. Existing incremental history is processing; no broad historical import or full catch-up claim. Fuzzy/filter/prompt work resumes separately under contacts-search-filters.
