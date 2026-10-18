# Building focus activity and event storage

Goal: provide a building-level activity card on the right of base focus, keep
avatar spread capped on the left, and add validated flattened event storage.

The original people/events card was implemented, then superseded by a newer
parallel conversation events-only card request. Preserve that update: current
people remain as avatars and person clicks retain their individual Schedule.
The frame is capped at480×640CSS pixels inside the left44%; events use a solid
inset card capped at460px wide on the right.

Migration024 is applied to the exact hosted project as20261018000104. Nine empty
arrays, exact receipt equality and preservation of rows/functions/ACL/RLS are
verified. Runtime reads remain source-policy filtered; service-role event writes
are denied. No event ingestion or policy adapter is activated.

Acceptance requires real local SQL/API checks, hosted schema/access verification
and direct synthetic browser checks of base focus, viewport bounds, stable
positions, person-view transitions and truthful empty/failure states. Current
results live in the rolling snapshot and evidence/map-building-activity/.
