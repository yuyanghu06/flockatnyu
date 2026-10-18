# Rapid UI refinements

Goal: apply the user’s successive visual and interaction changes directly,
without subagents. Scope includes map event cards, portrait thought bubbles,
and the assistant composer/launcher. Each requested change is complete when its
behavior is implemented, checked at desktop/mobile sizes where relevant, and
recorded in the rolling journal. Current requests pass direct build/targeted
Node/browser checks; later requests continue this user-led iteration. No backend
schema/data changes or deployment are part of this UI work. Read milestone.md
and the linked pass records for current details and superseded experiments.

The transcript cutoff now reserves a fixed18px strip outside scrolling messages, above the lower panel inset. Desktop/mobile/short-screen scroll offsets, live resize and manual scrolling pass browser checks; empty composer dimensions are unchanged.
