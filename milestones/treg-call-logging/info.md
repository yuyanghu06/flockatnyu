# Treg full-call logging

Goal: privately retain each actual Treg lookup request, complete bounded response and contact-import outcome so the integration can be inspected.

Scope: a separate private file logger, durable lifecycle hooks, secret redaction, seven-day retention and meaningful simulated integration/filesystem checks. The user additionally requested exact raw lead storage with supported-field-only display, including preserving unknown schemas. Existing model-audit restrictions, contact projection, UI and source boundaries remain unchanged. No schema or deployment work is included.

Completion requires independent behavior verification, final review and production package/API checks. Current status and live-verification limits are in the rolling milestone snapshot.

Status: complete locally, independent tester PASS and evaluator ACCEPT. All 22 focused behavior checks, final API build and actual 283-file production package pass. No private token/live lookup/hosted import/logging/deployment was verified. Cleanup advances on new calls; explicit markers describe bounded/incomplete captures.
