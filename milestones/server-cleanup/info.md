# Server cleanup and remaining provider integration

All remaining provider work is integrated into the grouped server structure.
Only `server/index.js` and `server/web.js` remain as root entry points. Services,
chat, audit, configuration and saved data live in named folders with guides.
API route files retain URL-shaped folders and detailed technical/purpose comments.

Moved code is formatted and below 500 physical lines. Existing worker/test debt
uses four explicit frozen limits. Tools call shared services directly rather than
our HTTP routes; `docs/tools-and-api.md` explains the actual mapping.

Independent review found no blocking code issue. Focused checks, prompt/AST
comparisons, formatting, lint, API build and five browser workflows completed.
The user explicitly stopped the final full test run, which remains unverified.
No further tests or automatic CI are run for this publication; ordinary hooks and
CI stay enabled for future work. Source, guides and provider histories are published through `950c4fe`; the
final receipt and saved discussion note follow in a documentation commit. No deployment, schema or business-data writes.
