# Campus map modules

`data/` holds the fixed catalogue, placements and explicit asset URLs. `camera/`
owns navigation, selection gestures and focus framing. `environment/` owns sky,
streets, parks and vegetation. `landmarks/` owns building geometry, replacement
rules, selected effects and resource helpers. `presence/` renders authorized
people, activity cards and current-event indicators.

Keep source coordinates, selectable merged geometry, human data and view-only
rendering separate. Browser source never fetches original provider content on
behalf of a saved map read.
