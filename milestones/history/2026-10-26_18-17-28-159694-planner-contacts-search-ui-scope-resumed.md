# Contacts search and UI scope resumed

- Local timestamp / acting role / milestone: 2026-10-26T18:17:28.159694-04:00 / planner / contacts-search-filters.
- Requested scope: Minimal inbox cache, plus compatible Contacts search/filter/prompt and latest focus/funnel/animation requests.
- Starting repository state: Existing live website preserved; unrelated Treg work remains local; active source ownership is exclusive.
- Work performed / changed files: Earlier stop replaced direct Gmail-to-Contacts capture with contacts_cache; latest user continued filter/UI requests. Resume compatible prior fuzzy search/filter/lead-prompt requirements separately from completed Gmail cache. Planned shared service-only048RPC ranks full table, optional AND filters and stable paging/sorts, typo matches for names/workplace; email/phone/notes literal. Apply048onlyafterindependentSQL/model/review. Preserve Treg work and existing deployed service boundaries.
- Decisions: Cache flow only writes contacts_cache; manual lead requests use Contacts. No automatic promotion, arbitrary source reads or Attio fallback. Website release must isolate reviewed search/UI changes from unrelated Treg/runtime changes.048pending;049alreadyappliedimmutable.
- Checks and evidence: Cache receipts under evidence/contacts-cache/; feature implementation reports distinguish own probes from pending independent browser/model checks. No new feature DDL/deployment claimed by these passes.
- Resulting state / acceptance: Cache complete; separate search/UI verification in progress.
- Remaining work and handoff: Finish independent feature checks/model behavior, review048andisolatedwebpackage, apply only048and publish website, verify actual UI/auth/reads.
