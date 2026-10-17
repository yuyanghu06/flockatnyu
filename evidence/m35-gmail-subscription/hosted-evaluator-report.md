# Hosted schema/history evaluation

Independent evaluator ACCEPT on2026-10-17. Read-only inspection used the normal
Supabase CLI credential in memory through the Management API; no secrets or source
bodies were printed or stored in evidence.

All8 hosted019 function bodies exactly match local SQL; argument names/types,
returns, invoker security, empty search paths and service-only execute ACLs match.
Both new tables force RLS, have expected primary keys and no client policies or
application triggers. Cache columns are exactly uuid/raw_response with generated
UUID default and required JSONB. Effective client access is denied; service role
has CRUD and RPC execution. All3 pre-existing table schema/ACL/data fingerprints
and20 pre-existing function definitions/ACLs remain unchanged.

018 receipt20261017182014 and019 receipt20261017182143 contain their exact full
local SQL.019 API400 occurred despite committed schema and missing history. After
exact schema verification root inserted only the missing019 receipt; no DDL replay
or prior history change. The API400 cause is unknown. A second019 apply attempt
was rejected at its existing table and changed nothing.

This pass accepts hosted schema/history recovery only. It does not establish live
Gmail watch, authenticated Pub/Sub delivery or new-message collection.
