# Source cleanup and CI

Browser code is grouped under app/features/map. Twenty-five API method files
mirror URL paths and document technical contracts plus plain-English purpose.
Twenty-one endpoints are active; four dormant routes remain unregistered.
Formatting, lint, 500-line JavaScript/400-line CSS limits, offline tests, isolated
browser checks, local hooks and GitHub release-package workflows are implemented.

Independent review accepts the cleanup. A clean Node 22.22 checkout of commit `39dd507`
passes standard CI (3,004 passed, zero failed, two existing skips) and all five
browser workflows. Six logical cleanup commits exclude concurrent Brand.dev work.
GitHub rejected their push because its OAuth credential lacks workflow permission;
publication awaits user authorization. Initial feature publication `fb2cd5b` is live
on GitHub. No production deployment or schema changes are part of this cleanup.
