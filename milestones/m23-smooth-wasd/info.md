# M23: smooth and faster WASD

Goal: ease keyboard starts, releases and direction changes and raise cruise speed
by60%. Scope: keyboard XZ velocity, minimal camera reset/frame-time wiring,
navigation guides and independent numerical/browser checks. Geometry/backend
remain unchanged.

Status: complete. Independent14numerical/16Chrome checks,46existing frontend
assertions,14preserved Chrome regressions, production build and final evaluator
acceptance pass. The caller frame-time finding was fixed and suspension-tested.
Motion evidence uses normal Chrome graphics; physical keyboard feel and other
hardware remain unverified. Current state/history are in ../milestone.md.
