# Storage-backed profile portraits

Goal: manage all profile portraits through Supabase Storage without a frontend rebuild for future additions.

Scope: private map-avatars bucket, canonical immutable per-person content-hash objects, existing avatar_url column, authenticated same-origin byte proxy, frontend resolver, guarded operator upload/CAS migration and independent tests. Existing source/identity policies, profile catalogue permissions and local original artwork remain. No public bucket, browser service keys, model avatar-edit tool or member grants.

Acceptance: hash-verified private objects and preserved profile facts; unauthorized image reads denied; correct current/event attendee images, dynamic new profile without rebuild, bounded failures, API/frontend/package checks and live rollout acceptance. Rollout uploads first, deploys compatible code, then switches profile URLs. Bundled fallback is removed only after verification.

Status: local implementation, independent unit/operator/browser/full-regression checks and review are accepted. All 27 private objects are uploaded and hash-verified. Railway rejected deployment during its platform pause, so no profile URLs were changed. Live cutover and removal of the bundled fallback remain pending. The reviewed package and private CAS manifest are recorded under ignored evidence/storage-avatars/. The rolling milestone records actual hosted state.

The 2026-10-22 combined release supersedes earlier local-only or blocked status: all four Railway services report SUCCESS, reviewed migration 036 is applied, all 27 portraits are verified, and the working-tree features are published in logical GitHub commits. See the rolling milestone and combined-release receipt for the checks and limitations. Saved future ideas and unrequested business mutations remain separate.
