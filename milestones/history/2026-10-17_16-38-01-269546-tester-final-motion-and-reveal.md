# Final loader visual verification

- Local timestamp / acting role / milestone: 2026-10-17_16-38-01-269546 America/New_York; tester; M43.
- Requested scope: user-directed loader and favicon refinements.
- Starting state: M43compositor source stable; circularfavicon supersededby user.
- Work performed / changed files / decisions / checks: Final natural unheld source startup removes the observed late2.65s stall: maxlongtask59ms in last3.5s beforeREADY, visibly changing colors preREADY andduringzoom. Final production desktopDPR2 showschangingpixels with1100/1043msphases andinertinput. Deliberate650ms blockedJS yielded28compositorframes withchangingpixels(MAE10.51). MobileDPR2 authoritative MutationObserver timing1121/1021ms; earlier534ms rAFobservation was late(firstsamplealreadyscale2.78), retained as harnessfinding.12helper/9gate/7browserfallbacks andmask404 fallback pass; sync/asyncactualGLB outputs exactlyequal. BuildPASS. Initialsetup/capturegaps remain; no uniformFPS/physicaldeviceclaim. Evidence:final-natural-dev,production-held-dpr2,production-mobile-dpr2-final,fallbacks under evidence/m43-smooth-reveal.
- Resulting state / acceptance: M43accepted; finalM42iconverificationpending.
- Remaining work and handoff: finishrounded-squareiconchecks andintegratejournal.
