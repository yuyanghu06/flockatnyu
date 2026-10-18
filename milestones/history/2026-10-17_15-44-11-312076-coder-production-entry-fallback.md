# M41 production entry fallback fixed

- Local timestamp / role / milestone: 2026-10-17_15-44-11-312076 America/New_York / coder / M41.
- Requested scope: richer flat pastel @ with seamless color shine as new loading animation.
- Finding: Vite removes the source entry script id, so the original inline download-error detector could miss production entry failures.
- Work performed: moved inline listener into head before generated module; recognizes source id or actual crossorigin module target, ignores unrelated resource errors, defers UI updates until failure DOM exists. Current guide updated; tester notified and fresh bundle built.
- Checks: frontend build PASS, startup9/9 and whitespace PASS. Built-inline simulation verified pre-DOM error => failed/inert/not-busy/hidden-art/focused-Retry and unrelated errors ignored.
- Result/handoff: source stable; actual production-browser failure, loop and reduced-motion acceptance remain tester-owned. No changes outside coder ownership.
