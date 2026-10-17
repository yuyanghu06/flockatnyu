# M30 Discord search evidence

Original messages and credentials are not saved here.

- before-reproduction.json: successful Discord HTTP200 search rejected by app;
 23parent-channel hits and2allowed registered child-thread hits.
- after-live-api.json: refreshed real API returns8scoped original-linked sources;
 2threads are freshly checked and coverage remains partial. No model/content writes.
- local-tests.log:90/90current tests, including13independent regression cases
 persisted by root in tests/discord-search-threads.test.mjs.

The fix does not change bot roles/source allowlists or add exhaustive author search.
