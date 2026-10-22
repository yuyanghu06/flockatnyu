# Private avatar uploads verified

- Local timestamp / acting role / milestone: 2026-10-21T14:01:23.786385-04:00 / orchestrator / storage-avatars.
- Requested scope: move profile portraits to private Supabase Storage without future per-avatar builds.
- Starting state:27local portrait URLs and artworks; no Storage buckets. Preserve unrelated work.
- Work/files: added operator-only scripts/map-avatar-storage.mjs with default read-only plan, scoped private bucket upload/readback, immutable person/SHA256 keys, private0600ignored manifest and CAS apply gated on compatible-web readiness. Created private map-avatars bucket capped4MiB/PNGonly; uploaded27original artworks/49,927,711bytes. Hash readback verified27/27; anonymous authenticated/public path reads denied. Existing27profileURLs and all prior facts unchanged;0profilewrites.
- Review correction: tightened UUID/hash lengths, privacy proofs reject5xx/redirect/unrecognized400envelopes. Observed provider missing-auth InvalidRequest400 and privatebucket NoSuchBucket404wrappedasHTTP400. Reverification with recognized envelopes underway; no credentials/source text persisted in tracked files.
- Checks: script syntax/default plan27profiles/no writes, gitcheck-ignore confirms manifest excluded. Actualupload receipt27verified/0migrated/allpriorfactspreserved.
- Result/handoff: private objects ready; profile cutover waits compatible reviewed web. Independent review found normal image burst saturation; backend adding bounded FIFOqueue before deployment. No runtime source permissions/Calendar/eventdata changed.
