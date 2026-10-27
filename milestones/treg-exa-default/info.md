# Exa default people search

Make Exa the default for people search while preserving native provider records, existing Contacts and separate enrichment policies. The shared search client calls Exa directly through Treg. Read-only JavaScript and SQL field readers display explicit names and a single unambiguous current company. Manual edits and explicit clears take precedence; no provider JSON or saved rows are rewritten.

Independent tests and release review passed. Migration 054 is applied, the website release succeeded, and one hosted search returned two readable Exa profiles. Full-row hashes show all 16 Contacts and 32 raw cache rows unchanged. Final independent hosted evidence review accepted the release. No required work remains.

Current release truth lives in the rolling milestone. Private evidence remains ignored; the orchestrator owns shared tracking documents.
