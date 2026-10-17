# Historical migration fixtures

These seven small fixtures preserve only algorithms and SQL-adapter contracts needed to verify immutable historical migrations: legacy-message, legacy-memory, legacy-summaries, legacy-summary-config, legacy-summary-schedule, legacy-summary-store and legacy-live-summary-store.

They are imported only by historical migration tests. They contain no runnable archive CLI, collector worker, vector provider or stored-summary fallback. Production server code and isolated deployment contexts must never import this folder. Current behavior is verified by the live Discord, event listener, catalogue, manual-disable and collector deployment suites.
