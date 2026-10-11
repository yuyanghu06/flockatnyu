# Presentation evidence

`tester-results.json` records 11 executed Node/static checks. `tester-report.md` explains scope and pending runtime checks.

Reproduce from repository root:

```powershell
node tests/map-presentation.mjs
```

The test imports local Three modules, loads JSON config dependencies as local data, exercises actual OrbitControls update math without a DOM, checks effects and shader source hooks, then writes the results file. It never starts a browser/server or performs network requests. No screenshots or GPU performance evidence exists for this pass.

`tester-provisional-*` preserves the earlier approximation before the actual personal-site source was retrieved. It is superseded by the current source-matched result and report.
