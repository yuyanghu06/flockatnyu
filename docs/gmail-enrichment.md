# Separate Contacts-cache enrichment service

This worker reads original senders from `contacts_cache`, calls Treg with only an email address, and inserts the native raw enriched contact into `contacts.raw_input`.

**The cache stays raw and unchanged.** The worker does not write Treg results, processing status or new fields into cache rows, and does not delete them. The intake collector remains separate. No Gmail messages, subjects, attachments or bodies are fetched or sent to Treg.

The user explicitly corrected the earlier cache-backwrite design. The earlier cache-backwrite050 draft was never applied. Its revised raw-only form is now hosted; no cache enrichment cleanup was needed. Implementation and release truth remain in the [milestone snapshot](../milestones/milestone.md).

## Daily provider order

The daily runtime uses Tomba first and Apollo second, with at most two providers total per email. `GMAIL_ENRICHMENT_MAX_PROVIDERS=2` selects both; `1` keeps Tomba only. This policy belongs only to this service; website Treg lookups remain unchanged. The user cancelled CSV reprocessing.

Both direct provider calls share the existing per-email `TREG_MAX_COST_USD` allowance (default$0.10); the second receives only the remainder. An uncertain cost, transport failure, authentication/budget refusal or logging failure stops further paid calls. A validated miss may use the second provider. Exact pre-charge provider-paused refusals can safely proceed at zero cost. Tomba matches retain the complete native `data` person object unchanged; full response envelopes remain in private logs. This keeps native names/email visible through existing flat Contacts readers without a website or schema change. Apollo fallback retains its complete native wrapper, including valid nameless matches.

Treg's routed waterfall is an on/off setting and cannot enforce two providers. The daily client therefore uses the two fixed direct endpoints. Tomba uses a GET with only the email query parameter. Apollo fallback uses a POST with only that email query parameter and no JSON body. No mail bodies or other Gmail content are read or transmitted. Each attempt is logged privately; all attempt logs receive the final outcome.

Implementation and actual deployment verification are recorded in the milestone. No CSV rerun or manual paid worker test is part of this update.

## Processing order

1. Read and lock one original cache row; create or claim a separate processing record with a source fingerprint, stable request ID, lease and spending reservation.
2. Perform the email-only Treg lookup. Validate the complete response in memory and retain its bounded full call in the existing private log.
3. In one database transaction, insert the unchanged native provider object into Contacts, settle the spending record, mark the processing record complete and release its lease.

A miss or unsupported native format records a small processing outcome without creating a contact. The shortened `output` projection is never substituted for the native `raw` object. Unknown object fields remain unchanged in Contacts. The screen/API read supported strings from the observed native `person` wrapper, with manual top-level overrides. Migration051 atomically retains the verified original lookup email in a separate `contacts.lookup_email` column because native reverse-email results may omit it; this never changes provider JSON or raw sender cache.

## What is stored where

| Location | Stored information |
| --- | --- |
| `contacts_cache` | Original unenriched sender input only; unchanged by this worker |
| `contacts` | Native raw enriched contact object unchanged, plus a separate verified lookup-email column |
| `contacts_enrichment_jobs` | Request IDs, source hashes, versions, attempts, retry times, spending and contact-ID/status receipts |
| `contacts_enrichment_state` | Configured operational scope, global lease and daily/cycle spending reservations |
| Private Treg logs | The explicitly authorized bounded full request/response and safe processing outcome, with credentials removed and seven-day retention |

Neither processing table stores enrichment responses, native profile objects, normalized names or copies of the original sender. They are bookkeeping, not another contact store. The service joins the original cache only when it needs the address.

## Restarts, edits and failures

Contact insertion and the completion receipt commit together. If the transaction committed but its reply was lost, later worker claims skip the completed job, avoiding another lookup or duplicate contact. If failure occurs before completion commits, a retry may call Treg again using the same durable request ID. There is no saved-response cache; provider idempotency is a retry aid, not an unlimited replay guarantee.

Database operations check the current lease, processing version and fingerprint of the entire original cache JSON. A sender edited during work blocks stale insertion. A later claim processes the new original through a distinct metadata record. Existing exact-email/UUID Contacts and human edits remain untouched; imports never merge or overwrite them.

The database serializes claims across worker instances and reserves spending before lookups. Request/count limits apply per cycle, with a durable UTC-day ceiling. Unknown costs retain the reserved allowance. Reported overruns are recorded and prevent later reservations rather than being silently clamped. Failures use safe reasons; unconfirmed writes are not reported as saved. Retry delay is one minute and work is quarantined after five claims, while original cache inputs remain intact.

## Setup and commands

Apply and independently verify Contacts047, sender intake049 and the revised service-only050 migration in that order. Do not apply unrelated pending migrations as part of this service. Runtime credentials are private `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `TREG_TOKEN` (optional `TREG_ORG`).

Enablement is explicit with `GMAIL_ENRICHMENT_ENABLED=true`. Configure `GMAIL_ENRICHMENT_ACCOUNT` and `GMAIL_ENRICHMENT_SOURCE_IDS` to match the authorized intake operator/source. These are operational service bindings, not fabricated per-row source provenance.

Batches default to at most50emails, processed one at a time, with a hard50-email ceiling. `GMAIL_ENRICHMENT_BATCH_SIZE` accepts1–50; lower `GMAIL_ENRICHMENT_MAX_ITEMS` or `GMAIL_ENRICHMENT_MAX_REQUESTS` values reduce the effective batch, but larger legacy limits cannot bypass50. Both legacy defaults are50. The existing120-second lease, $0.50 per cycle and $1.00 per UTC day remain. `TREG_MAX_COST_USD` is the shared per-email ceiling across both daily providers, default $0.10. Keep the service disabled until schema, settings and private log storage are verified.

- `npm run gmail:enrichment:status` checks readiness without a paid lookup.
- `npm run gmail:enrichment:once` processes one bounded cycle.
- `npm run gmail:enrichment:drain` manually drains pending work through finite batches.
- `npm run worker:gmail:enrichment` runs the time-guarded scheduled command.
- `npm run deploy:enrichment:prepare` creates an isolated source-only upload context; it does not deploy it.

Console output contains status/counts, not email addresses or provider bodies. Full Treg logs use this service’s own private persistent `/data` volume, as described in [the Treg guide](treg-contacts.md). Google OAuth files, collector/planner/frontend code, tests, real data, logs and secrets are excluded from uploads.

## Daily 9 AM Eastern schedule

The user selected 9 AM New York local time, including daylight saving. Railway cron expressions use UTC, so production starts the finite `scheduled` command at `0 13,14 * * *`. The command checks `America/New_York` before creating a runtime: one UTC candidate is the 9 AM processing run, and the other exits as `skipped_schedule` without accessing the database, Treg or source data. Railway can start a few minutes late, so the guard accepts the New York 09 hour.

The run drains sequential batches instead of stopping at five senders. It exits when pending work is empty, a budget or failure/unknown-cost boundary stops progress, cancellation occurs, or the absolute `GMAIL_ENRICHMENT_MAX_DRAIN_CYCLES` guard is reached (default and maximum 1,000 batches). Completed jobs are skipped and deferred work is not waited on. A budget stop does not mean every pending sender was enriched. Each batch processes at most50emails sequentially. The same durable spending limits can stop a batch before50; there is no new50-email daily cap.

Between successful, nonempty batches, the drain waits `GMAIL_ENRICHMENT_POLL_MS` (default5,000ms) before claiming more inputs. It stops without another pause/claim on empty queues, unsafe results, spending/unknown-cost/logging limits, cancellation or the cycle ceiling. The wait is abortable; shutdown during the pause prevents the next batch and closes resources. This interval also retains its existing use in development `serve`; `once` remains exactly one batch.

Production uses restart policy `NEVER` and closes logging when done, so a previous polling process cannot block future cron starts. It does not process existing cache entries immediately during an off-hour deployment.

## Verification

The raw-only correction passed 31 focused checks through actual local SQL and production adapters with simulated Treg. A statement-level trigger that rejects any INSERT/UPDATE/DELETE on contacts_cache permits successful processing; whole cache rows remain exact. Tracking is metadata-only, contact/completion commits atomically and human edits remain preserved.

The scheduler matrix passed 36 total checks, adding summer/winter/DST dates, off-hour zero runtime creation, graceful finite termination and actual SQL-backed processing of seven senders across multiple batches with no extra lookup on rerun. API build, shell/whitespace, exact source pins and the isolated 18-file package passed independent review. Local SQL uses one connection and does not establish real multi-session hosted locking.

Reviewed migration050 is now hosted as `20261026225556_gmail_contact_enrichment`; the original 28 sender-cache rows kept the exact pre-application hash, and no Contacts or processing rows were created by DDL. Railway service `gmail-enrichment` is deployed with its own private 500 MB `/data` volume. The user added TREG_TOKEN privately on that service; a variable-backed read-only runtime readiness check returned ready without a Treg lookup. Initial deployment `11646098-3e75-4fc8-bd4b-ada477ef23de` was SUCCESS, with cron `0 13,14 * * *`, restart NEVER and next candidate `2026-10-27T13:00:00Z` (October 27, 9 AM New York). The original policy completed a natural October27 9AMET run:32senders,2native Contact inserts and30misses. That run used the previous routed provider policy. Daily deployment e38af83c-b440-4f82-a65d-d3bd66ade8d1 introduced Tomba first and Apollo second, with explicit maximum2. Only the daily provider module changed from accepted0888release; other15-filepackage components remain identical. Live configuration and read-only readiness are verified; first actual new-provider outcomes await the next normal9AMNewYork run. No CSV rerun or manual paid test was performed. Multi-session locking remains unverified; current deployment/readback truth is in the rolling milestone.

The current batching deployment is `d780e172-3aa8-41d6-a10b-b1cd24722aec` (SUCCESS), independently accepted after a live configuration/readiness check. Batch size, item limit and request limit are 50; the hard ceiling is 50, processing remains sequential and the pause is 5,000 ms. The reviewed package changes only the four daily batching modules; Tomba/Apollo policy, spending limits, cron and storage remain unchanged. The next normal run is October 28 at 9 AM New York time. No manual paid test or production cache injection was performed.

Batching verification used the real CLI and current local SQL with 101 synthetic cached senders and simulated Treg responses: batches were 50 + 50 + 1, followed by an empty check, with one provider request at a time. Independent checks also covered lower limits, the hard ceiling, aborting during a pause, unchanged raw cache, exact native Contacts and zero provider calls on completed-work reruns. Live verification used only service metadata/settings and a read-only readiness RPC; it does not establish actual post-release provider outcomes.
