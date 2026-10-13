# Immediate map entry and current navigation feedback

Goal: strip decorative loading UI, add WASD, pull Bobst/Silver back and make Gould
Plaza part of Stern. Scope: frontend startup/input/view profiles/selection roots.
Acceptance: real readiness and recoverable failure; no decorative entry screen;
WASD preserves camera geometry, respects bounds and never interferes with typing;
20% noncompounding pullback; unchanged plaza geometry with shared Stern hover/click.
Status: complete; startup9/WASD5/camera21/input16, Chrome14input/grouping and23camera checks, production build and diff checks passed. Evidence under evidence/m21-map-input/.
Shared current state: ../milestone.md. User requested direct work, no specialists.
