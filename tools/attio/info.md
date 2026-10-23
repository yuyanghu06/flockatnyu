# Attio assistant adapter

`index.js` defines five tools: search/read records, discover attributes, create records and update records. Each call requires an authenticated principal, the configured source UUID in `allowedSourceIds` and an explicitly allowed object before provider I/O. Mutation tools additionally require the server write gate. Content and original links remain request-local, with bounded `attioContext`, source excerpts and truthful incomplete fuzzy-search/truncation coverage.

`createAttioTools({client,config})` exposes stateless `execute` for a protected direct API and `createRequest({principal,userMessage})` for chat. The request closure captures the actor and original user text. Chat writes require nonempty original user text; tool descriptions require explicit current-user intent and forbid instructions from retrieved records. Updates require a successful exact record read in that same request. A read does not resolve ambiguous user intent or provide optimistic concurrency guarantees.

Identical request-local writes share an in-flight and settled receipt, including uncertain failures, to prevent replay. Any unknown write outcome blocks further distinct mutations for the remainder of that request, requiring later reconciliation. Updating consumes the read observation; another distinct update requires a new exact read. This deduplication is request-local and is not a durable provider idempotency guarantee. There are no delete tools, arbitrary URLs/paths, worker registration or cross-request CRM archives.

Website steering advances a private input counter through an internal method,
separate from all callable tools. Update receipts include that counter so a new
human correction can restore an earlier value after another exact read. Prior
receipts, actor/source grants, read permits and the run-wide uncertain-write stop
are retained; create receipts keep their original duplicate protection.
