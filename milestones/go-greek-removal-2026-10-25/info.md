# Go Greek removal

Goal: remove the temporary Go Greek popup at 683 Broadway from Flock and delete its attached Flock database entries, as requested October 25. Preserve the original background tower, nine normal landmarks, shared activity indicators, member profiles and events linked to other buildings. Calendar and Discord originals are outside this removal.

Acceptance: no popup selector/root/camera/module request, intact original city tile; no `683-broadway` catalogue row or building links, and no exclusive attached events/attendance; unrelated records preserved. Use a guarded forward cleanup under the existing map lock, keeping applied migration037 immutable. Test SQL behavior, build/API checks and browser behavior; independently evaluate before release.

Status: local implementation, independent SQL/browser tests and evaluator ACCEPT are complete. Reviewed276-file web deployment408f84bb-9525-4119-b9c8-02dd3752952e is SUCCESS and live checks pass. Database cleanup is prepared but unapplied: the saved project-scoped MCP is read-only and fresh writable OAuth remains pending after two attempts expired. Default MCP configuration remains unchanged.

Browser evidence proves all2032source tile triangles, including70tower faces, remain; retired-tower clicks stay unselected and Bobst focus works. SQL tests use actual001–045 plus046 in PGlite and preserve every unrelated row/timestamp. Generic indicator tests use Silver Center. Private receipts/screenshots are under evidence/go-greek-removal-2026-10-25/ and evidence/go-greek-removal/coder-indicators/.

A concurrent user-requested source correction updated the GoGreek occurrence at Kimmel. It is outside this location cleanup and must survive. Calendar/Discord originals, operational audits and unrelated saved tasks remain outside the deletion scope.

Pass receipts: [plan](../history/2026-10-25_13-50-42-559102-planner-removal-plan-reviewed.md), [implementation](../history/2026-10-25_13-52-24-873205-coder-popup-runtime-removed.md), [guarded SQL and package](../history/2026-10-25_13-55-05-113724-orchestrator-guarded-cleanup-and-release-prepared.md), [independent tests](../history/2026-10-25_13-55-51-490338-tester-cleanup-preservation-verified.md), [evaluation](../history/2026-10-25_13-55-51-515551-evaluator-retirement-local-accepted.md). Hosted checks verify exact index/all8JS/CSSassets, health/auth and presence API availability. The API still includes the Go Greek catalogue row: database cleanup remains incomplete. [Live release and access blocker](../history/2026-10-25_14-01-04-523897-orchestrator-website-retired-database-auth-pending.md). Actual hosted outcome and remaining work are recorded in ../milestone.md.

[Refreshed database authorization handoff](../history/2026-10-25_14-01-37-271205-orchestrator-database-auth-handoff-refreshed.md): no database deletion yet.
