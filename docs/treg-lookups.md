# Dormant Treg lookup routes

These four backend operations are prepared for later use. Their registration function is **not imported or called by the running application**. They have no model tools, UI, worker or CLI connection, and the current application returns 404 for their paths. Building them does not activate or deploy them.

| Operation | Reserved POST path | Fixed upstream endpoint |
| --- | --- | --- |
| Find an email | `/api/treg/people/email/find` | `treg.people.email.find` |
| Verify an email | `/api/treg/people/email/verify` | `treg.people.email.verify` |
| Find a phone number | `/api/treg/people/phone/find` | `treg.people.phone.find` |
| Enrich a company | `/api/treg/companies/enrich` | `treg.companies.enrich` |

`server/treg-lookups.js` supplies the fixed contracts, input validation and operation client. `src/api/treg/register.js` exports the optional registration function. Tests may register it on an isolated application; production callers must not import it until a later integration request.

## Input

Each handler accepts exactly a UUID `requestId` and an operation-specific `input` object. For example, future email verification would accept:

```json
{
  "requestId": "89a443a7-c8a0-4c94-891f-40113cc83386",
  "input": { "email": "person@example.com" }
}
```

| Operation | Allowed fields | Required information |
| --- | --- | --- |
| Email finding | `domain`, `full_name`, `first_name`, `last_name`, `linkedin_url`, `linkedin_handle` | A LinkedIn URL/handle, or domain plus full name, or domain plus first and last name |
| Email verification | `email` | One literal email address |
| Phone finding | `linkedin_url`, `email`, `domain`, `full_name`, `first_name`, `last_name` | A LinkedIn URL, an email, or domain plus complete name |
| Company enrichment | `domain`, `website`, `name`, `linkedin_url`, `linkedin_handle`, `email` | At least one supplied identifier |

Unknown keys, batches, blank values, invalid identifiers and incomplete combinations are rejected. Caller-controlled endpoints, tokens, headers, costs, callbacks and routing settings are not accepted. Website/LinkedIn URLs, domains and field sizes are checked before dispatch.

## Results

A completed operation returns `status: "ready"`, its `operation`, `hasResult`, an allowlisted `output`, and `usage` containing provider, call ID and observed cost in micro-USD. Missing cost remains null. Provider-native bodies and private log handles are not returned.

- Email finding returns the supplied email and any supported confidence/name/verification values. Finding an address does not automatically verify it.
- Email verification preserves `valid`, `status` and any supplied score. An invalid address is a completed verification result. Unknown or catch-all results are never converted into a positive deliverability claim.
- Phone finding returns the phone and any supplied line type/country code.
- Company enrichment returns the supported name, domain, website, description, industry, employees, founding year, location and LinkedIn URL. Employee counts are exposed as text or null: an upstream nonnegative safe integer is converted to decimal text, while existing strings and ranges are preserved. Negative, fractional, unsafe and malformed counts are rejected.

A null primary result is a miss for that operation/provider. A blank non-null primary field is rejected as an invalid response; optional empty descriptions remain unchanged. A 202 response explicitly marked pending remains pending; no polling or retry is started. Failure or a miss does not prove that every provider lacks the information.

## Existing boundaries

Each operation makes one fixed Treg request with the existing private token/configuration, default $0.10 ceiling, stable caller/operation/input/request-ID idempotency and **no provider fallback**. The user explicitly retained the existing person enrichment setting; these additions do not change that client.

Requests must be authenticated, same-origin, bounded JSON. Required private logging is durable before dispatch; responses/errors are bounded and credential-redacted, with a final lookup outcome. Logging failure blocks dispatch or returns an honest failure without retry. Logs keep the existing seven-day retention policy.

These operations never read Gmail or cache rows, save Contacts, call Jev, chain another lookup or change other services. A later activation request must deliberately connect the registration function and verify the intended caller. Current implementation, test and release state lives in the [milestone](../milestones/milestone.md).

## Official contracts

The planner checked the public routed catalogs for [email finding](https://treg.to/catalog/endpoints/treg.people.email.find), [email verification](https://treg.to/catalog/endpoints/treg.people.email.verify), [phone finding](https://treg.to/catalog/endpoints/treg.people.phone.find) and [company enrichment](https://treg.to/catalog/endpoints/treg.companies.enrich), plus the [official routing implementation](https://github.com/superdesigndev/treg/blob/main/src/treg/application/call/route.py) for pending results. These metadata reads do not verify a live paid response. Authentication, cost and idempotency behavior follow the [integration guide](https://treg.to/integrate.md).

## Verification

Independent tests exercise actual clients and isolated registered HTTP handlers with simulated provider responses, a real temporary private logger and a global live-network blocker. They cover all four operations, selectors/auth/origin, single-request cost/idempotency, private logging/error/size failures, caller/deadline races, pending results and honest null/unknown/blank-field handling. The actual default app still returns 404 for all four paths and advertises only its existing Treg tools. Focused existing Treg regressions, API checks and independent evaluator review pass. The actual 286-file production package is byte-identical to the prior accepted release and excludes both new modules.

Run `node --test tests/treg-dormant-routes.test.mjs` for the new behavior checks. Providers are simulated; no live paid behavior, deployment or profile retrieval is claimed. HTTP tests inject the bounded JSON reader at the optional registration seam. Current source hashes and receipts are in the milestone's ignored evidence directory.

## October 27 current-provider trial

A later authorized live test exercised these handlers in an isolated authenticated local app with real Treg clients. The production routes remained unmounted. For ten engineers and four companies, email finding returned two addresses, phone finding returned five numbers, and company enrichment produced two accepted results plus two invalid-response outcomes. Verification and person enrichment used only the two returned addresses: one verification was valid and one was risky/false; both enrichment results matched the requested names. No address was guessed. No Contacts/cache write or email send was attempted.

The 28 requests cost $0.012855, exactly matching the balance decrease. Treg selected BlitzAPI for email/phone finding and person enrichment, Trykitt for verification and TheCompaniesAPI for company enrichment. No provider settings or fallback changed. These are observed selections, not a comparison of alternate providers. The sample does not establish identity accuracy, phone accuracy or email delivery.

The original trial found a response-type mismatch: Google and Microsoft company records returned numeric `employees` values, while the client expected text or null. These were rejected records, not company misses. A later user-requested fix converts safe nonnegative integer counts to text during output projection, preserving the original numeric response in private logs. The HTTP handler retains its independent text/null validation. Verification and completion are recorded in the milestone; the routes remain dormant.
