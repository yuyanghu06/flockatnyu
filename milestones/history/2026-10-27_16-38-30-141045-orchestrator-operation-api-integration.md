# Private operation API integrated locally

- Local timestamp / acting role: 2026-10-27_16-38-30-141045 / orchestrator.
- Implemented 54 explicit private POST routes grouped by URL/provider, each with technical access/service/limit comments and a plain-English purpose. Tools are clients; domain execution now lives below the API. Public generic tools dispatch registered API sessions without recursion; runtime Google composition binds once.
- Private WeakMap Request bindings retain caller/source/lease/read capabilities; JSON cannot grant them. Original map read results and prepared worker objects remain private. Existing synchronous lifecycle controls and original exception stopping behavior are retained. No public router mount, network hop or new credentials.
- Independent static review found lossy JSON inputs and a cleanup race. Added lossless JSON argument checks and session epoch/abort rechecks before dispatch and after asynchronous preparation. Unknown write results remain uncertain.
- Completed static checks: repository lint, format check, physical limits (759 modules; four unchanged legacy exceptions), API syntax/dependency build and frontend build. Frontend retains its existing large-chunk warning. Optional harness source inventories migrated without running them.
- Tests remain stopped. No test/browser/model/provider calls, package upload, deployment, business-data writes, commit or push. Local uncommitted implementation awaits evaluator signoff; runtime acceptance remains pending.
