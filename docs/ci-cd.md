# Checks, commits, pushes and releases

Prompt assets are explicit dependencies. Runtime/collector packagers copy only fixed `promptText` references from reachable JavaScript modules and their allowlisted Markdown files. Model-source copies include the full asset registry. `build:api` validates registered assets, and prompt payload whitespace is preserved rather than Markdown-formatted.

Run `npm ci` with Node 22.22 or later, then `npm run hooks:install` once in each
checkout. The pre-push hook runs `npm run ci`. Hooks are local and bypassable;
GitHub required checks provide enforcement for pull requests.

## Before committing

Keep each commit about one reviewable change. Check `git diff` for unrelated work,
credentials, private evidence and build output. Run `npm run format` and the
relevant behavior tests while editing. A refactor must preserve requests, returned
fields, permissions and user-visible behavior.

`npm run ci` runs these gates in order:

1. Prettier checks all of `src`, the organized server folders, the two server
   entry points, Gmail send service/store, the new CI scripts and configuration.
2. ESLint checks JavaScript in `src`, `server`, `tools`, `scripts` and `tests`.
   Frontend code also has stricter recommended rules and cannot import server
   handlers, provider tools or Node built-ins. The existing I/O-free
   `server/chat/attachments.js` contract is the sole allowed shared server path;
   lint prevents it from importing modules or using process, require or fetch.
3. File-size checks count every physical line, including blanks and comments.
   JavaScript/MJS files have a 500-line limit; CSS has a 400-line limit.
4. The API import/syntax check and frontend production build must pass.
5. All `tests/*.test.mjs` and the ten explicitly listed offline frontend suites in
   `scripts/run-tests.mjs` run with at most four test files concurrently.
   Packaging tests run after the build and inspect real source-only packages.

`npm run test:browser` separately exercises real Chromium, Vite, the Hono API and
Contacts storage with simulated business services. It checks map startup,
selection, contact preservation, streamed chat rendering and mobile layout.
No production credentials or paid model/provider calls belong in standard CI.
Install the locked browser using `npx playwright-core install chromium`, or set
`CHROME_PATH` to an installed Chrome executable.

This is a JavaScript project. No TypeScript/type-check gate is claimed. Existing
unformatted backend files are checked by ESLint; the initial mandatory formatter
scope includes `src`, the organized server folders and the CI files. Existing
provider/worker folder internals retain their prior formatting unless edited as
part of a separate reviewable change.

## File limits and existing large files

`config/file-limits.json` names every existing oversized backend/test file and its
frozen maximum. They may shrink but cannot grow. No `src` exception is allowed.
When a file falls below the normal limit, remove its exception; stale entries
fail the check. Split by responsibility instead of merging statements into fewer
lines. New exceptions require an explicit reviewed policy change and a breakup
plan. Do not regenerate the baseline to make a failing check pass.

Prioritize splitting the worker's adapters, handler and staged pipeline, then the
assistant context and staged integration test. These are existing debt, not
permission to add new oversized modules.

## Pull requests and main

Prefer a short branch and pull request. Include the concrete behavior change,
checks actually run, limitations and release notes using the repository template.
CI runs on pull requests and pushes to `main`; both `quality` and `browser` must
pass. Before merging, fetch current `main`, resolve conflicts while preserving
both authors' work, and rerun affected checks. Never force-push shared `main`.

Repository administrators should require `quality` and `browser`, require review,
block force pushes/deletion and dismiss stale approvals in the GitHub branch
rules for `main`. The committed workflow does not itself create those remote
rules. The initial authorized direct push is a checkpoint, not evidence that
branch protection has been configured.

## Release packages and production deployment

The manual **Release packages** workflow only accepts `main`. It reruns quality
and browser checks, then prepares all five source-only service packages from the
same exact commit. The artifact name and `manifest.json` record that commit.
Packages include reachable reviewed server modules and built frontend assets,
never local environment files, private logs or browser source in server modules.

Production deployment remains an explicit operator step using the existing
Railway deployment procedure in `docs/deployment.md`. No production secrets or
automatic live deployment are introduced by these workflows. Before uploading:

1. Select the successful release artifact for the intended commit. Record the
   previous known-good deployment/commit and affected services.
2. Review migrations and private configuration separately. Do not automatically
   apply SQL migrations as part of a source-code push.
3. Upload only the relevant extracted service package, using the existing
   authenticated Railway project/service. Use a protected production environment
   and an approval gate before automating this step in the future.
4. Confirm Railway reports a successful rollout, check `/healthz` for the web/API
   service, and inspect each worker/collector's readiness and sanitized logs.
   Verify affected authenticated user tasks without unsolicited business writes.
5. On a failed health check, restore the prior known-good service deployment.
   Source rollback does not undo a schema/data migration; plan those separately.

A successful build or uploaded package is not proof of a healthy deployment.
Record actual release IDs, checked commit and remaining limitations in the journal.
