# Individual URL-shaped endpoint files completed

- Local timestamp / acting role: 2026-10-27_14-23-24-113962 / coder.
- Implemented twenty-five method files: twenty-one active and four dormant. src/api folders mirror URL segments with named [parameter] folders; each method file registers exactly one path. Shared request/auth/response helpers and composition stay separate.
- Every endpoint documents its method/path, plain-English purpose, inputs/limits, auth/origin rules, touched services/writes, output/failure/uncertainty behavior. Complete inventory documents service-root /healthz exception. Dormant handlers remain unregistered and unpackaged.
- Coder checks: API build/lint/format/line limits/whitespace pass; affectedHTTP121, refinement19 and package3checks pass. Independent review confirms handler callbacks and preservation/CAS semantics match existing behavior.
- Unrelated company-provider work remains separate; route comments use provider-neutral contract wording. Final isolated cleanup checkout verification and publication are next.
