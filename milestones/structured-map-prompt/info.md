# Structured map contracts and update-agent prompt

Goal: give the actual update-agent system prompt exact existing people_here and scheduled_events storage shapes, grounded label/time/identity rules and approved two-hour policies.

Scope: server/map/contracts.js, runtime prompt import, independent SQL/provider-delivery tests, evidence and documentation. No schema, cloud-data, grants, tool registration or UI changes.

Completion requires schema/example compatibility with actual001–024 SQL, preserved fixed-building/event-write boundaries, actual handler delivery, policy regressions and independent review. Completed locally: combined206/206 and final-focused32/32 checks pass; evaluator ACCEPT. These results do not prove live model compliance.

Current truth and blockers remain in ../milestone.md; future map tools, semantic enforcement, event-write policy and bounded worker pilot are separate work. See ../../docs/update-agent-prompt.md and ../../evidence/structured-map-prompt/report.md.
