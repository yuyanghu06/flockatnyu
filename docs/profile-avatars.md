# Profile portraits in Supabase Storage

Profile portraits use the private `map-avatars` Supabase Storage bucket. The
existing `map_people.avatar_url` column stores the canonical object URL:

```text
https://<SUPABASE_URL host>/storage/v1/object/authenticated/map-avatars/<person UUID>/<SHA256>.png
```

The bucket accepts PNG files up to 4 MiB. Original generated artworks remain in
`assets/avatars/` for editing and recovery; they are not the long-term browser
delivery mechanism. No original supplied photographs are imported by this flow.

The backend projects a stored URL to `/api/map/people/<person UUID>/avatar`.
The existing site password session and API authentication protect this route.
The service checks the exact trackable profile, configured project, bucket,
person, content hash, PNG signature/dimensions, size and deadline before returning
bytes. Credentials and private object URLs never reach browser image requests.
The response is private and non-cacheable. No signed bearer URLs, public bucket,
browser upload permissions or agent profile-edit tools are introduced.

## Operator workflow

Use the ignored local environment with the existing project-scoped Supabase
service credentials. Never paste or commit their values. From the project root:

```sh
node --env-file=.env scripts/map-avatar-storage.mjs
node --env-file=.env scripts/map-avatar-storage.mjs --upload --manifest=evidence/storage-avatars/migration.json
```

Default mode only plans. Upload mode copies immutable original PNG bytes and
reads them back to verify their hash. It verifies that anonymous authenticated
and public object URLs are denied. A private mode0600 manifest records original
profile values, verified object identities and successful updates. Each migration
uses a separate manifest; reuse an existing manifest only to resume that same
migration. `--person=<UUID>` limits a resumable step to one manifest member.

For the initial cutover, deploy the compatible backend and frontend first. Only
after verifying that release should the operator run:

```sh
node --env-file=.env scripts/map-avatar-storage.mjs --apply --web-ready --manifest=evidence/storage-avatars/migration.json
node --env-file=.env scripts/map-avatar-storage.mjs --verify --manifest=evidence/storage-avatars/migration.json
```

Apply changes only `avatar_url`, comparing the original profile ID, old URL and
`updated_at` before each write. Conflicting edits stop the migration. Identity,
name, email, visibility and creation facts must remain unchanged. Rerunning an
already-applied matching migration verifies it without rewriting the row.

After initial web rollout, a newly authorized profile/avatar uses the same
upload-and-apply flow with a new manifest and needs no frontend rebuild. Profile
creation and provider identity verification remain separate operator actions.
Reload an open map page after replacing an existing portrait to request its new
bytes through the stable authenticated image URL.
An agent cannot upload files or create/edit profiles through this mechanism.

Legacy local paths/imports are temporary cutover compatibility. Remove those
frontend imports only after all intended profiles have been verified in Storage.
Keep local original artwork and the private manifest for recovery. Actual upload,
profile-cutover and deployment status lives in `milestones/milestone.md`; this
guide does not claim that a local implementation has been deployed.

## Hosted cutover — 2026-10-22

After the compatible combined web release reachedSUCCESS, Supabase MCP changed all27avatar_url values using exact ID/original URL/updated_at guards. The first profile was verified before the remainder. A hash over every other profile fact was identical before/after. All27authenticated hosted responses returned200PNG with original SHA256 bytes and no-store; anonymous access returned403. Private Storage and source artwork remain intact. The private migration manifest records the verified cutover. Legacy frontend imports remain as compatibility-only cleanup work.
