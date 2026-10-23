# Tool isolation audit and implementation

Goal: isolate all chat/planner tools and verify prompt-selected workflows.

Status: all twelve audited paths corrected, independently reviewed and integrated into the original checkout. Actual-model conversations use simulated business storage;95dispatches include preserved failures. Final current behavior check184passes/one unavailable private historical replay. User authorized deployment; current web/worker rollout and read-only production checks are next. Read the rolling milestone for exact current release truth; the restart handoff is historical.

Ordinary operations keep local authentication, exact grants, catalogues, versions and leases. The separately named post-finish Calendar-to-map sync is the explicit user exception. Full checks/limits: [verification](../../docs/tool-isolation-verification-2026-10-23.md).
