# Planner saved-task storage verification — October 23, 2026

The worker previously loaded every complete saved task at startup, during phase transitions and before completion. The new backend uses a small catalogue to select work and reads complete records only for exact relevant IDs. Model prompts and exposed tool schemas are unchanged.

## Storage and checks

Migration045 adds service-only catalogue and exact-read functions. Both check source scope, expiry and runner lease. They do not prune records, fetch source content or hold a runner write lock while serializing histories. Existing039functions, data, RLS and mutation checks remain.

Catalogue metadata grants no read receipt or write authority. Current input coverage compares complete originals. Selected task disclosure retains complete compact/full views, fragment handling and exact-version proof. Completion compares complete relevant snapshots and timestamps. Existing generated IDs are read before merging; mechanical and untouched work stay saved.

Runtime files are automation/task-store.js,staged-pipeline.js andhandler.js. Storage diagnostics retain fixed operation/error categories, HTTPstatus, elapsedtime and responsebytes; they never log failed source bodies, raw exceptions or credentials. Existing16calls/reply,64calls/stage,10follow-up-turn limits and timeouts are unchanged.

## Executed checks so far

Local actual PostgreSQL(PGlite) and synthetic production-runner checks pass. The synthetic131-task complete dataset is12,504,265bytes, its catalogue68,153bytes and one complete read99,901bytes. A runner scenario uses a12,497,894byte backlog; largest storage response95,528bytes, four exact reads restricted to the selected task,130oldtasks unchanged. These scripted runner checks verify storage mechanics; no actual model request or live Calendar/map/source mutation was made.

The read-only hosted metadata query shape selected all137unexpired tasks and took722.196ms; its serialized response was88,583bytes. It omitted the private source-scope helper predicate because that helper cannot execute through the developer's read-only connection. It is a query-shape benchmark, not an exact RPC or identical-snapshot comparison. The earlier full131-task aggregation took16,502.305ms. Original historical failure subtypes remain unproven.

The final focused current and frozen-source gates each pass306checks with no failures or skips. They cover actualSQL/serviceguards, large-backlog runner behavior, currentoriginals, same-version content changes, versions, expiry, source revocation, lostlease, fragmentdelivery, confirmed exactresolution, mechanical collisions and untouched preservation. The unchanged15second request deadline is exercised directly. API syntax/dependencies and whitespace pass. Independent evaluator ACCEPT.

Four older suites retain24currentfailures. An isolated baseline replacing only the three changed runtime files with prechange Git5283209 has25failures, and every current failedtestname also fails there. This is not a whole-repository passing claim. Current fixture APIs and exactsource hashes were maintained; closed historical evidence was not edited.

## Hosted migration and worker

Reviewed local045 is applied as hosted20261023234558_agent_task_catalogue through the existing signed-in correct-project SQLeditor. The6020-byte storedsource receipt exactly matches localSQL. SourceMD5 isb4ea77c7fc50b37046015432c7210e28; cataloguebodyMD5f392fbba078995ff3b4c06c44979bcd9 and readbodyMD5e6ecaf4ebf4b4881ac091dd282b4eb29 match. Both functions are SECURITYDEFINER with emptysearchpath and service-only execute; PUBLIC/anon/authenticated are denied. Normal developerMCP remains read-only.

The first migrationwrapper had an embeddedreceipt dollar-escaping issue caught before execution. Corrected wrapperSHAe71321af902ed3f46b810943ef6944e3758e1add1214256f78407b49a6b37ed6 passes exactliteral comparison and independent actualSQL execution. Editor content was checked byte-for-byte before Run. No erroneous wrapper was applied.

REST empty-scope probes verify both new endpoints: catalogueHTTP200/ready0tasks32bytes, exactreadHTTP200/not_found23bytes. They make no queue/source/business changes. Explicit PostgREST schema refresh is included.

Railway workera34ade2f-42aa-4c1d-a190-8cc51447d45b is SUCCESS/online, activated7:52:01PMNewYork. The60-filepackage contains releasedd56baseline plus exactly handler.js,staged-pipeline.js andtask-store.js. It excludes unrelated web map-validation/diagnostic-vocabulary changes, tests, credentials and private evidence. All packagedhashes match reviewedsource.

An ordinary queued run starts after activation. Its populated catalogue returns87,370bytes in1,407ms with HTTP200/ready. Initial finish_batch then returns ready in1,562ms. This establishes real storage and initial-phase progress; a full cycle and successful task resolutions remain to be observed. No forced run, live testmessage or business-write smoke test was issued. Existing separate Calendar-to-map sync remains in its ordinary position after initialfinish.

Ignored detailed query/package/test/receipt/screenshot evidence remains under evidence/planner-task-storage/. Current sourcecommit is23c0e69; final publication and ordinary-cycle outcomes remain in the rolling milestone.
