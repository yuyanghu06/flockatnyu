# Server responsibility folders and preservation checks planned

- Local timestamp / acting role: 2026-10-27_15-25-07-891521 / planner.
- Scope: group all thirty root service/chat modules by responsibility while retaining only server/index.js and server/web.js as stable entry points. Existing cohesive provider/worker directories stay intact except import updates.
- New groups: runtime, chat, contacts, treg, audit, auth, shared and knowledge; Gmail send service/store join google. Format moved code and split oversized context, diagnostics, audit serialization and importer logic into coherent modules. No new file-limit exceptions.
- Root owns external consumers/config/deployment/docs; chat and other server writers have exclusive ownership; tester owns fixture paths/source inventories. Preserve all public exports, prompt bytes, source boundaries, receipts, redaction order and budgets.
