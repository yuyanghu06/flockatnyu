# Shared long-term memory

The chat agent maintains one shared note for useful lasting club information.
It proactively calls `update_memory` whenever a chat reveals information it judges
worth remembering. Users do not have to ask it to remember or update the note.
Explicit corrections and forget requests also apply. This user requirement is
saved in notes.md and enforced in the injected maintenance prompt.

The schema is deliberately small: `agent_memory(id, content, updated_at)`, with
exactly one `id=shared` row. `content` is ordinary text, capped at 16 KB. There are
no per-user rows, embeddings, memory histories or extra scheduled jobs.

At each authenticated chat request, the backend reads the current note before
planning, then injects it into both planning and answer prompts. Successful model
updates refresh the same request's context; later requests read the persisted
version. Core instructions remain in code. The note is background information,
not trusted instructions, permission grants or proof of current source facts.
Memory is shared across members, so named people must not be assumed to be the
current user.

`read_memory` refreshes the shared note. `update_memory` replaces the complete
merged text using the exact injected `updated_at` as `expectedUpdatedAt`. A stale
version conflicts instead of overwriting another chat's changes; read, merge and
retry. Identical content is a no-op. Empty text supports a requested reset/forget.
Unknown facts are not invented. Temporary event/presence state stays in its normal
activity storage. Chat transcripts, provider contents/summaries, credentials and
private personal details must not be copied into this shared note. Existing live-
only Discord/Miro and source-access policies remain unchanged.

Both memory tools require the existing trusted chat principal. The write also
requires server-owned current-user context and a previously loaded snapshot;
model arguments cannot select another record. The generic read-only HTTP tool
dispatcher does not grant memory writes. Browser roles have no table/RPC access.
The service role reads through a bounded RPC and updates only through the
service-only optimistic RPC; direct DML is denied.

Implementation: server/memory.js, tools/memory/index.js, server/assistant-context.js,
and the chat API entrypoint. The update agent is not changed or activated by this
chat feature; its memory exposure remains a separate scope decision.

Migration031 is applied to Tech NYU project jssehnrmqhstcrtxulpa at hosted version
20261018175242. One empty shared note is seeded. A service-role update was verified
and rolled back, leaving no synthetic memory. Live service read succeeds. Receipt:
evidence/long-term-memory/hosted-receipt.json.

50 focused memory/SQL/chat/bug-report/Calendar/provider checks pass, including a
real SQL→tool→Hono flow that saves information supplied without a remember request
and injects it into a second chat. API build and focused whitespace checks pass.
A fresh isolated entrypoint on 3138 exposes both tools; the existing 3001 preview
still needs its next normal restart. No real-model pilot or production deployment
was performed. Three old assistant-connectors-api assertions still assume tool
progress records do not precede metadata; the broader 50-case run that included
those tests passed 47 and failed those 3 stream-order assertions. They are unrelated
to memory (those fixtures do not load a memory adapter), and were left untouched.
