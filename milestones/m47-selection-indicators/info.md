# M47 selected building indicators

Goal: make selected buildings unmistakable with a persistent smooth white silhouette outline and a white ground footprint band, both entering with a short animation.

Scope: selected-only rendering helpers, existing effects integration, minimal post-beauty outline hook, focused tests and browser evidence. Preserve steady white hover, camera/avatar behavior, source geometry/material ownership and depth occlusion. No lift, pulse, floating marker or deployment.

Implemented: full-DPR/MSAA outline; fixed-order ground bands; synchronized330ms fade and ring-owned outward morph; immediate first-returning-frame cleanup; reduced-motion completion latch; explicit Arch/Paulson map-coordinate metadata; authoritative two-component concave Stern footprint excluding Gould.

Completion requires visible real-building ring/outline, smooth edges at DPR1/2, correct entrance with reduced-motion support, immediate scroll-out cleanup, bounded resource ownership and independent review. Current status: complete locally; build,16presentation+5memory+10focused checks, DPR1/2 GPU/browser, actual immediate scroll cleanup and complete Stern after-fix evidence pass. Independent evaluator ACCEPT. No physical-device or cold first-selection uniform-FPS claim.
