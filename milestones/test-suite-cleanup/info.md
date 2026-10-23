# Maximum safe test cleanup

Goal: remove obsolete/redundant tests following the full repository audit, preserving historical SQL verification and meaningful current behavior. Scope is test scripts, fixtures and documentation; production source, assets, migrations and deployments are unchanged.

Complete:17obsolete standalone programs and13redundant registered cases removed, four actual-asset cases added, six stale/static standalone checks and13obsolete optional-model scenarios removed. Useful geometry and actual map interactions are consolidated into current tests. Current inventory:169testfiles,2450individualcases plus40parents,37standaloneprograms.

Independent full suite:2490reportedresults,2489pass,0fail,1optionalskip; final asset/personal-location versions and76retainedstandalone checks pass. Independent finalbrowser9/9groups passes on stablehash, covering30frames,20actualpointerselections and3oppositeviews. Evaluator ACCEPT; build passes. See ../../docs/test-suite-cleanup.md and after-cleanup CSV. No additional cleanup is required for this milestone.
