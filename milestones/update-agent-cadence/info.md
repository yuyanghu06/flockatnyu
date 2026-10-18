# Update agent cadence

Goal: trigger model processing at 30 eligible queued inputs or oldest age 30 minutes, retaining the existing 1-minute cooldown and 5-second idle poll interval. Discord messages/events and Gmail email inputs count together.

Scope: local defaults, environment example, current guides and targeted verification. Per-claim maximum remains 20 inputs/64KiB. No activation, deployment, credentials or applied SQL changes.

Complete when configuration, example and documentation agree and independent real-SQL threshold/cooldown checks plus evaluation pass. Status: complete. Defaults/example/guides agree; independent automation suite79/79 and API build pass, evaluator ACCEPT. Update agent remains inactive.
