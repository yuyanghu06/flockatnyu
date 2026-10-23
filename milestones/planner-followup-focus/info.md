# Focused planner follow-up

Goal: process one or two ready current-cycle tasks before older backlog and reduce default saved-history disclosure. Keep the existing 16 calls per reply, 64 calls per stage and 10 follow-up turns.

Scope: ordered task references, compact exact task/original reads, explicit lossless full-history access and model-selected workflows. Source, identity, version, lease and completion checks remain in place. No schema, provider or budget changes.

Acceptance: independent meaningful regression checks, bounded configured-model follow-up scenarios through production runners/adapters on simulated services, semantic review and resolved findings. Untouched tasks and retained evidence must survive exactly.

Status: complete. Code and model evidence accepted; worker deployment d56cea87-c123-42ac-b992-9d57418f5680 reports SUCCESS and startup plus ordinary source/model processing are observed. Organic full-cycle verification is separate from the completed simulated model checks. See the rolling milestone and docs/planner-followup-verification-2026-10-23.md for exact outcomes and limits. Unrelated chat work was excluded from the worker package.

October23 post-release diagnosis: two startup and seven initial-finish failures share full saved-task loading. A pure SELECT reproduction took16.5seconds for131tasks. Historical error subtype remains uncertain; no fix was implemented. Compact model views do not reduce this backend snapshot. See the rolling milestone and linked planner/evaluator/investigation entries.

October23 recommendation: small task catalogue plus targeted complete saved-task reads across all five list sites; current checks and retained tasks stay intact. Recommendation only; implementation and measured query/runner acceptance remain pending. See the rolling snapshot.
