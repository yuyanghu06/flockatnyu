# Visual and database catalogue test contracts corrected

- Role / scope: coder follow-up for the evaluator's introduced test regression.
- Changes: tests/map-schema.test.mjs explicitly checks the nine immutable database identities and ten visual identities (those nine plus 683-broadway), preserving existing avatar assertions. Count-only assertions/labels were updated in six current browser scripts: map-refresh, map-input, lipton-selection, brand-loader, map-presence and map-browser.
- Checks: node --test tests/map-schema.test.mjs passes 12 tests; all six affected browser scripts pass node --check; scoped whitespace checks pass. These existing browser suites were not claimed rerun. New dedicated model browser acceptance independently passes, with stable-server confirmation underway.
- Boundaries: no runtime, source asset, migration, database or deployment changes. Historical milestone scripts retain their historical contracts. Existing unrelated working-tree changes preserved.
- Status / next: regression corrected; evaluator recheck and final integration remain.
