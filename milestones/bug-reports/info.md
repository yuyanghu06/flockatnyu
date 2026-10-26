# Bug reports

Goal: let chat record structured user-reported product bugs in a minimal hosted
table. Scope: migration029, service RPC, bounded chat tool and receipt-aware
prompting. Acceptance: SQL/grants/idempotency, chat provenance, actual entrypoint
inventory and hosted rolled-back write pass. Implemented and verified; existing
main preview requires its next normal API restart. No production deployment or
real-model pilot was performed. Current details live in ../milestone.md.

October25: hosted report `5ad778a5-c122-4f67-9ff4-347a8cb6f210` records Calendar cancellation/replacement map inconsistencies. The HP records were manually corrected; the general bug remains open in notes.md and milestones/to-do.md.
