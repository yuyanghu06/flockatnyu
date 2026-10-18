# Natural load freeze reproduced

- Local timestamp / acting role / milestone: 2026-10-17_16-26-36-446375 America/New_York; tester; M43.
- Requested scope: user-directed favicon and smooth loading refinements.
- Starting state: M41 native contour loader; broad unrelated working tree preserved.
- Work performed / decisions / checks / resulting state: Independent tester captured unheld source startup and CPU profile under evidence/m43-smooth-reveal/natural-dev and natural-dev-profile. A2637ms main-thread task coincided with2652.6ms presented-frame gap and2755ms compositor screencast gap. Video stalled at its loop boundary then resumed at zoom. Profile attributes about2.5s to Courant/Stern source-window Raycaster traversal. Paused flags and held-resource checks did not prove motion; acceptance requires natural-load visible pixels.
- Remaining work and handoff: final independent visual checks and evaluation before acceptance.
