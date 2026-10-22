# Retained assets

This folder collects reusable project assets while preserving their source boundaries.

- [yuyang-site-3d-assets/](yuyang-site-3d-assets/README.md): the original map export,
  including its manifest, placement instructions, model licenses and provenance.
- [campus-assets/](campus-assets/info.md): project-derived geometry and offline map data.
- `avatars/`: 27 generated low-poly portraits with readable person-name filenames.
- [building-portraits/](building-portraits/info.md): nine matching generated building portraits, full-resolution originals, compact web thumbnails and exact prompts.
- [references/](references/info.md): retained reference text used during modeling.

Runtime code imports map assets from here; developer scripts use repository-relative
paths. Export-relative paths in the original manifest and placement instructions
remain relative to their own export folder. Keep model coordinates, original source
paths, attribution and licenses intact. The optional `yuyang-site-3d-assets.zip`
archive is absent. Historical evidence and journal records retain their original paths.

[branding/](branding/info.md) contains requested raster logo explorations, exact generation prompts, and the native v5 SVG startup loader with a shareable GIF preview. Earlier drafts are retained.

Event-type image generation was cancelled after both sample sets were rejected. The newly generated event-icons directory was deleted at user request; avatar/building/branding assets are preserved.

Profile portrait Storage migration preserves these local artworks as originals. The private bucket/proxy/operator workflow is documented in docs/profile-avatars.md. Temporary browser imports remain until verified live cutover; see the milestone for actual status.
