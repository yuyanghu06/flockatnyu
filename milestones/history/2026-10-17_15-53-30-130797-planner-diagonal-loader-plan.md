# M41 faster diagonal motion planned

- Local timestamp / role / milestone: 2026-10-17_15-53-30-130797 America/New_York / planner / M41.
- Requested scope: richer flat pastel @ with seamless color shine as new loading animation.
- Requested revision: move colors faster and diagonally while @ remains still.
- Read-only planner checked nativebuilder/assets/tests and loopmathematics. Proposed3.2s period, gradientvector(L,L), translation(-L,-L) with L1254 changesphase exactlyoneperiod; expandedpaintbounds avoidholes. Diagonalsheen endpoints stayoffstage.
- Decisions: keepstaticSVGbyteidentical, no startup/readinesschanges, targetnative0/800/1600/2400/3200frames plusmatrix/reducedmotion/buildchecks. No newdependencies or externalactions.
- Handoff: primaryimplements; testerownsfocusedchecks and evaluatorreviews.
