# Contacts search, filters and UI refinements

Shared Contacts search gains full-table SQL ranking with conservative name/workplace typo matches, combined names, literal email/phone/notes and explicit Name/Workplace/presence filters plus stable sorting/paging. The real/mock UI uses a pastel funnel, outline when inactive and filled when open/active, with neutral focus cues and Spotlight-matching380ms/180msdialogmotion. Manual lead requests default to Contacts; Attio requires an explicit request.

Completion requires meaningful actual SQL/API/browser tests, a capped configured-model evaluation using both Contacts/Attio over simulated persistence, private048migration review/application and isolated website release. Preserve separate Treg work and Gmail cache; no automatic cache-to-CRM promotion. Current status lives in ../milestone.md.

Complete:048hosted20261026222756, websitecbfbf5caSUCCESS, exactassets/privateRPC/auth/actualfilterandmotionbrowser checks accepted.13offlinechecks,16browserentries and6actualmodelscenarios(26requests) pass. Hosted CRM empty; no live Contact writes. Cache049/Gmail239remain separate and unchanged.
