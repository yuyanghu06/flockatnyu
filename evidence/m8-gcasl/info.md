# GCASL evidence

Independent filesystem geometry checks pass; browser and photo-fidelity acceptance remain pending.

- `tester-geometry-results.json`: executed 12-check result with GLB hash, removal counts, bounds and model statistics.
- `tester-report.md`: independent tester scope, conclusions and unavailable checks.
- `reference-source-check.json`: coder-produced source evidence; separate from independent checks.
- `offline-*.png` / `offline-review.mjs`: offline review artifacts owned by another agent; these do not establish browser rendering or interaction.

Reproduce numerical checks from the repository root:

```powershell
node tests/global-center-geometry.mjs
```

The test uses only local GLB files and source modules and rewrites `tester-geometry-results.json`. It does not contact localhost, start a server, or open a browser. Browser access was denied in this session and no alternative access was attempted. Original exported assets are unchanged.
