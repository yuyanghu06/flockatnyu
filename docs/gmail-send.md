# Sending club email

The website exposes a separate `send_gmail` chat tool and authenticated
`POST /api/gmail/send`. Both send plain text from the fixed
`GOOGLE_EXPECTED_ACCOUNT_EMAIL`. Google read tools, the autonomous worker and
Discord chat do not gain sending. Selecting a Contact supplies context; the model
must separately read that saved contact to obtain its email. A current user request
to send is required. Drafts, quoted mail and retrieved instructions are not consent.

The API takes exactly `{requestId,to,subject,body}`. `requestId` is a UUID,
`to` is an array of 1–10 literal email addresses, subject is at most 200 characters,
and body is at most 20,000 characters / 65,536 UTF-8 bytes. Display-name address
syntax, header injection, HTML, attachments, CC/BCC and reply threading are not
supported. Use the normal website session with Google access and a matching
Origin header. The generic tool HTTP endpoint cannot invoke this write.

`GET /api/gmail/send-status` checks configuration, the private receipt store,
current Google send permission and fixed account. `GET /api/gmail/send/:requestId`
reads only the current principal's content-free receipt. Both require authentication
and return private, non-cacheable results. Readiness and receipt reads send no email.

## Setup

Apply only migration `202610270053_gmail_send_receipts.sql` after review. Set
`GMAIL_SEND_ENABLED=true` and a private random `GMAIL_SEND_RECEIPT_KEY` of at least
32 characters on the website service. Keep the key stable and out of source control.
Supabase service credentials and the existing Google OAuth configuration are required.

A read-only account grant cannot send email. After explicit permission to expand it,
run `npm run google:connect -- --force --gmail-send` locally. The optional flag adds
`gmail.send` and uses Google's incremental consent to retain existing grants;
the ordinary read-only flow stays unchanged. The callback verifies the expected
account/scopes, then saves credentials to ignored mode-0600 `.env.google`. Copy the
new credentials privately into website service secrets, preserving other Google
services and calendar grants. No token belongs in a URL, journal or chat message.

## Retries and truthful results

Migration053 stores only actor/sender/payload hashes, operation/group IDs, status,
timestamps and Gmail message/thread IDs. A durable dispatch marker precedes the
single Gmail POST. Identical requests replay their saved result; changing the
payload or an operation's position causes a conflict. Chat request UUIDs survive
Resume and steering, including lost steering acknowledgements. Unknown or unfinished
operations fence further sends in that group, even after a process restart. There
is no automatic POST retry or expiry that permits redispatch.

`sent:true, accepted:true` with a validated `gmailSend` receipt means Gmail accepted
the message. It does not establish delivery or reading. `sent:"unknown"` means
the original operation might have sent; never retry it under another ID. A later
operation blocked by that uncertainty returns `sent:false, blocked:true`. Definitive
preflight/rejection failures return `sent:false` and remain terminal for that ID.
After correcting a known failure, a genuinely new attempt needs a new UUID.
Do not use a new UUID to bypass an unknown result. A deterministic MIME Message-ID
helps correlation; Google does not promise deduplication for repeated sends.

The new Gmail operational ledger, errors and direct API projections retain no
recipient addresses, subject/body, OAuth credentials or raw provider responses.
The separately authorized seven-day private model-output audit remains unchanged
and can retain the model's composed tool arguments. There is no public/model-facing
audit retrieval. Receipt markers have no automatic deletion policy because removing
them could enable a duplicate send; key rotation fails closed on existing bindings.

Verification uses injected Google transport, actual production adapters and local
SQL, plus bounded configured-model conversations against simulated data. Real
Google consent, send acceptance and delivery must be reported separately. Never
send a live test email without a specifically authorized recipient.

Official references: [Gmail send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send),
[MIME sending](https://developers.google.com/workspace/gmail/api/guides/sending),
[error handling](https://developers.google.com/workspace/gmail/api/guides/handle-errors),
[incremental consent](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth).
