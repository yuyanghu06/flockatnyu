# Shared agent input cache migration

Goal: add a local service-only shared input buffer for Discord, email and future
sources, with exactly uuid and raw_response JSONB columns. Scope is migration018
and local SQL verification. No source subscription, ingestion, LLM schedule,
cleanup worker, Calendar writes or hosted application is included.

Completion requires exact column/default/primary-key checks, JSON round trips,
service CRUD/browser denial and independent review. Status: locally complete; independent SQL tester and evaluator pass10/10.
Hosted migration018 is now applied as20261017182014, independently verified in
the M35 activation pass alongside019 metadata20261017182143. Current acceptance and next action live in ../milestone.md.
