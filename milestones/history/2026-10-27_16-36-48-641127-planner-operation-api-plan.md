# Private operation API migration planned

- Local timestamp / acting role: 2026-10-27_16-36-48-641127 / planner.
- Latest user request authorizes implementing tools → APIs → service → provider, superseding the earlier saved discussion-only status. Testing remains stopped.
- Plan covers 54 fixed named operations, one private Hono endpoint file per operation, bounded JSON transport and server-retained principal/source/lease/read/preparation state. No public mount, network hop or new credentials.
- Root owns API foundation/routes, integration/config and journal. Three coders exclusively own Google/worker, Map/Contacts/Treg, and Discord/Miro/Attio/knowledge operations. Specialists cannot spawn children.
- Acceptance preserves current schemas, receipts, native raw data, cancellation/audit stopping conditions and separately dispatched sync. Runtime acceptance remains deferred; static checks and review only.
