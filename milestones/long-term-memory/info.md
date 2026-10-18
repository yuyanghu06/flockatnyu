# Shared long-term memory

Goal: inject a small shared memory note into chat and let the model maintain
useful club facts automatically without explicit remember requests. Scope: one
three-column singleton table, bounded read/update tools and shared prompt context.
Schema, real-SQL chat tests and hosted read/rolled-back update are verified.
Existing preview needs its next normal API restart; no worker or production
deployment is included. Current status is in ../milestone.md.
