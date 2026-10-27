# Company employee-count fix planned

- Acting role: independent planner; orchestrator records the report.
- User scope: fix the company-enrichment integration failures diagnosed in the prior route test.
- Starting state: Google and Microsoft returned successful upstream records, but numeric employee counts failed the client’s text-only output validation. The four lookup handlers are dormant and excluded from the deployed app. Existing unrelated working-tree edits remain preserved.
- Plan: only the company employees field may convert a nonnegative safe integer into decimal text during client output projection. Preserve strings, ranges, null and omitted values. Reject negative, fractional, unsafe and unrelated malformed values. Keep the HTTP contract and independent injected-client validation unchanged. Original response bodies and private logs retain numeric values.
- Ownership: coder owns server/treg-lookups.js only; tester owns tests/treg-dormant-routes.test.mjs and private replay evidence; orchestrator owns guides and journal. No specialist may spawn agents.
- Acceptance: replay both original provider bodies through the actual client and authenticated local HTTP handler; verify successful text output, unchanged native logs, strict numeric boundaries and unrelated-field validation. Run affected existing tests and verify production routes remain unmounted and excluded from the package.
- Checks: planner inspected both saved responses and confirmed all other projected types are valid. No network, paid lookup, data write, settings, schema or deployment changes.
- Decision: accept this bounded fix. No paid rerun or route activation is required. Remaining work: implement, independently test, evaluate and integrate.
