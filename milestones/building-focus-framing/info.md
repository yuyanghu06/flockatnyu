# Building focus framing

Goal: every selected building's complete model stays visible outside the activity card. The shared map-focus-layout.js contract reserves desktop side-by-side and compact stacked space; camera-focus.js fits real bounds at existing facade angles and distance limits, widening the lens smoothly only when needed. All ten buildings pass at three actual browser viewport sizes (30 combinations); three numerical checks and existing regressions/build pass. Complete locally; production deployment and physical-device acceptance are separate. Current status is in ../milestone.md.
