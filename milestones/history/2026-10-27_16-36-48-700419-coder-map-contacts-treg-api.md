# Map Contacts and Treg services moved below private APIs

- Local timestamp / acting role: 2026-10-27_16-36-48-700419 / coder.
- Moved execution and schemas into server/{map,contacts,treg}/operations. Thin tools retain compatibility exports; factories unwrap the base map service before binding chat operations. Native caches, receipts, symbols and request state stay server-side.
- Coder reported three constructor bodies identical and all 362 semantic strings unchanged. Parent inspected factories and added synchronous updateUserContext forwarding; corrected inherited entry execution to use the chat service validation. Removed one unused initializer for strict lint.
- Scoped syntax, imports, lint, formatting and file limits passed; largest owned module 449 lines. No tests, inference or live writes; integration review remains pending.
