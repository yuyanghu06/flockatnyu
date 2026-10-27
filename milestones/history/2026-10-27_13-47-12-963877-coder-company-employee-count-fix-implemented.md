# Company employee-count compatibility implemented

- Acting role: coder; orchestrator inspected and records the pass.
- Scope: fix only numeric company employee counts that caused the Google/Microsoft integration failures.
- Changes: server/treg-lookups.js now uses a local projected value and converts it to decimal text only for company_enrich.employees when Number.isSafeInteger(value) and value >= 0. Existing strings, ranges, missing values and null remain unchanged. Negative, fractional, unsafe and other malformed types still fail existing validation. No other fields or operations are coerced.
- Preservation: original parsed provider bodies and private logs remain numeric. The HTTP handler keeps its independent string/null contract and remains unregistered in production. No settings, schema, source access, Contacts/cache data or other application files changed.
- Checks: coder syntax/whitespace and eleven simulated real-client/local-handler cases pass, including both observed counts, invalid types and native log preservation. Source SHA 3aca71492d24bc47e15477fd117204148e081b8bab94612f1416b79708defba1. Root inspected the exact projection change; API build and package proof are running separately.
- Result: implementation frozen for independent testing. No live or paid calls, route activation or deployment occurred. Root updated the output contract and affected guides.
- Handoff: independent tester replays both exact saved responses and verifies bounds, native preservation and unchanged authorization/failure behavior; evaluator follows.
