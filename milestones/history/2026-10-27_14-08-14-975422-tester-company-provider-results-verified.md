# Company provider results verified

- Local timestamp / role: 2026-10-27_14-08-14-975422 / tester.
- User scope: compare company-enrichment providers under the prior $10 ceiling.
- Starting state: complete live matrix and retained private raw evidence.

Independent result review accepts the actual 32-call evidence with explicit identity/factual caveats. Verified 32 unique provider/domain pairs and call IDs, 34 complete private logs including two balance reads, all HTTP 200, every charge known, and $1.698160 exactly matching the balance decrease. No new API calls were made by tester.

Offline field review corrects CompanyEnrich to 7/8/8/8 core values and TheCompaniesAPI to 8/8/6/8. These values were present in native nested locations/social links, website descriptions or industry lists but omitted by the original projector. Original reports and native logs remain unchanged. All 32 rows include private source paths and quality warnings in tester-results.json.

PDL is the strongest provisional option for structured company identities and Brand.dev for basic descriptions/value. Several alternatives mix unrelated companies or contradictory fields. Anysphere is a valid Cursor identity. PDL employee_count measures linked current profiles, not verified staffing; other exact/range values also have source/scope uncertainty. TheCompaniesAPI's four $0 replies are explicitly cached. No universal accuracy claim or default switch follows.

Evidence is private under ignored `evidence/treg-company-provider-compare/`. No provider-default, application, schema, Contacts/cache, source-grant, route or deployment changes occurred.
