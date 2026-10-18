# Smaller favicon mark

- Local timestamp / acting role / milestone: 2026-10-17T16:41:02.076779-04:00; orchestrator; favicon-small-mark.
- Requested scope: user confirmed smaller @ in favicon, matching reference size direction.
- Starting state: concurrent rounded-square favicon implementation present; no priortrackedbaseline. Preserved currentbadge/canvas/nativecolors and unrelated map/branding work.
- Work performed: builder wraps nativeart incentered0.65scale group, regeneratesSVG/16-32-48ICO; threeHTMLentryfaviconqueries now small-at forcache refresh. Updatedbrand/scriptguides. No loading artwork or map styles changed.
- Decisions: reduceonlyglyph35%, keepexistingbadge footprint; regeneratefromnativeSVG ratherthanrastermanipulation. Initialtargetclarificationresolvedbyexplicituserfaviconreply.
- Checks/evidence: buildercompleted; freshfrontendbuildPASS withexistingchunkwarning; scopedwhitespacePASS. Primaryinspectedlight/dark16/32/64preview; no nativebrowserchrome screenshotclaimed.
- Resulting state: requestedfavicon-sizechange implemented; independentchecks/review recorded separately.
- Handoff: finalguides/journal; refreshtabtofetchsmall-at assets.
