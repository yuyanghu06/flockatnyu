# Storage avatar release handoff

- Local timestamp / acting role / milestone: 2026-10-21T14:29:50.146602-04:00 / orchestrator / storage-avatars.
- Requested scope: move portraits to Supabase Storage so new photos do not require website builds.
- Starting state: existing portrait/profile work and unrelated dirty changes preserved.

The private Storage implementation and upload stage are ready. All 27 PNG portraits (49,927,711 bytes) were uploaded to the private map-avatars bucket, read back and hash-verified. Anonymous reads are denied. All 27 profile rows remain exactly unchanged, including their existing avatar URLs.

The backend serves person-bound private images through the existing authenticated site. The frontend accepts those URLs without requiring a build for each new person. Operator migration changes only avatar_url with ID, old URL and timestamp guards. Normal portrait bursts wait in a bounded queue instead of losing images. Local original artwork and the temporary bundled fallback are retained.

Verification: 1,921 tests passed, one existing optional test skipped, zero failures. Six browser checks passed, including 27 current-person plus 27 attendee images added after the production build. API/frontend builds and independent review passed. The 265-file web package matches the reviewed runtime/build bytes and passed a private-value scan.

Railway rejected the deployment with “Deploys have been paused temporarily”; no deployment ID was created. Its official status update at 18:15 UTC confirms the pause. Live cutover is therefore incomplete. After platform recovery, recheck the package, deploy the compatible web service, verify its authenticated proxy, CAS-switch one profile and then the rest, verify images and preserved profile facts, and only then remove the bundled fallback and release that cleanup. Do not backfill against the old web service. Pending worker migration036 and other releases remain separate. No background deployment job was created. The map time selector remains notes-only.

Evidence lives under ignored evidence/storage-avatars/: final-status.json, migration.json (mode0600), release-package.json, browser-report.json, full-tests.log and deploy-attempt.log. This entry clarifies the compact wording of the preceding integration entries; their outcomes are unchanged.
