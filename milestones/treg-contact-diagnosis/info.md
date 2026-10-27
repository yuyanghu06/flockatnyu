# Native Treg Contacts and loading behavior

Goal: show saved native Treg names and emails, retain exact provider JSON, capture the original lookup email separately, and correct Contacts selection/idle animation. The user authorized restoring the two existing email values from exact import receipts.

Completion requires production-adapter/SQL checks, independent review, the narrow schema update/repair, and a reviewed website release with authenticated readback. Existing raw records/cache, unrelated services and concurrent daily-provider work must be preserved. Current state is in ../milestone.md.

Status: schema and exact-two-email recovery live; website deployment ca6f36ad SUCCESS with authenticated API/assets/Chrome verification. Final independent evidence review accepted; complete. No paid lookup or raw/cache rewrite.
