# Source cleanup and CI

Browser code is organized under app/features/map. API folders mirror URL segments,
with one JavaScript file per method and path. All 25 endpoint files explain their
technical contract and plain-English purpose. Twenty-one endpoints are active;
four lookup endpoints remain dormant and excluded from production packages.

Formatting, lint, 500-line JavaScript/400-line CSS limits, standard offline tests,
isolated browser checks, local hooks and GitHub CI/release-package workflows are
implemented. Five pre-existing oversized backend/test files have frozen limits;
no src exceptions are allowed.

Independent evaluation accepts the cleanup. A clean Node 22.22 checkout passes all
quality/build gates, 3,004 tests (zero failures; two existing skips), and five
browser workflows. Source and records are published to main through `728f6f7`.
GitHub's remote CI results are available in its Actions run; no production release
or schema changes were performed. Required branch checks remain an administrator
configuration step. Concurrent Brand.dev work is preserved outside these commits.
