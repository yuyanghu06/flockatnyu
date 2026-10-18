# Transcript cutoff above panel inset

- Local timestamp / acting role / milestone: 2026-10-18T15:01:08.358614-04:00 / direct implementation and verification / rapid UI refinements.
- Requested scope: cut messages off before the spotlight panel's lower inset starts; bubbles still clipped against the outer panel edge while scrolling.
- Starting repository state: prior scroll-follow and content-padding fixes present, alongside unrelated in-progress backend work; preserve all existing changes.
- Work performed / changed files: src/assistant.css reserves18px of non-scrolling bottom padding on panels with a visible transcript. tests/assistant-scroll-browser.mjs now checks the scrollport-to-panel gap at top,35%,70% and bottom scroll offsets at1280×844,390×844 and390×480. Updated source/test/milestone guides and tracking.
- Decisions: reserve the gutter outside the scrolling content, so arbitrary scroll positions cannot paint messages over the inset. Empty composer retains its existing dimensions. Existing scroll following and resize animation remain.
- Checks and evidence: node tests/assistant-scroll-browser.mjs passes all3viewports/four streaming turns, fixed gutter>=17.5px at every sampled scroll offset, latest-message clearance>=20px, composer growth/shrink and manual scroll retention;0pageerrors. Desktop and short-mobile cutoff screenshots inspected at /tmp/flock-transcript-cutoff-1280x844.png and /tmp/flock-transcript-cutoff-390x480.png. node --test tests/assistant.test.mjs passes7/7. npm run build passes with existing chunk-size advisory.
- Resulting state / acceptance: message scrollport ends18px above the panel bottom, leaving the ivory inset strip visible even mid-message.
- Remaining work and handoff: user visual feedback; no deployment, model calls, source writes or backend changes by this pass. Checks performed directly without specialists.
