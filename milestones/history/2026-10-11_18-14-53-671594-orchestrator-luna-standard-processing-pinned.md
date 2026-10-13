# M20 standard Luna processing pinned

- Local timestamp / acting role / milestone: 2026-10-11T18:14:53.671594-04:00 / orchestrator / M20.
- Requested scope: Preserve cheap, bounded Luna pricing during actual summary calls.
- Starting repository state: Provider omitted service_tier, leaving project-selected automatic processing.
- Work performed / changed files: summary-provider.js now explicitly requests service_tier default. Supabase folderguide also refreshed with accepted005/archive facts and006 pending.
- Decisions: Official Responses reference states omitted tier defaults auto/projectsettings; default uses standard model pricing. No priority/flex/fast or fallback is requested.
- Checks and evidence: Official https://developers.openai.com/api/reference/resources/responses/methods/create verified; provider19/19passed. Independent tester adds explicit tier assertion to final suite. No model calls in this pass.
- Resulting state / acceptance: Focused cost-tier fix passed; final integrated storage/review and hosted proof remain pending.
- Remaining work and handoff: Finish summary scale/cache/resume accounting acceptance, then real pilot/allmanifest and separate hosted continuation.
