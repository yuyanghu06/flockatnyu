# Server services grouped with behavior-preserving splits

- Local timestamp / acting role: 2026-10-27_15-25-07-946587 / coder.
- Thirty flat server modules now belong to responsibility folders; only index.js and web.js remain at the root. Chat uses thirty-two focused modules; other services split audit dictionaries/argument diagnostics/serialization and Treg identity/import logic. Folder guides explain responsibilities and connections.
- Preservation evidence: all 1,191 chat strings/templates and eight generated planning/answer outputs match the originals. Non-chat declarations were independently compared; exports, source/identity/version checks, budgets, redaction-before-truncation and native records remain unchanged.
- Completed checks before stop: focused chat/input cases, seventy-one privacy/Treg cases, API build, formatting, strict lint and physical line limits. All new/moved modules stay below five hundred lines; only four pre-existing worker/test exceptions remain. No inference, paid calls, deployments or schema changes.
