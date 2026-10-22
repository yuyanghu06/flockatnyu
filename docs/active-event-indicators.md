# Active-event map indicators

`src/map-event-indicators.js` shows one yellow exclamation marker and a softly flashing gold overlay for each loaded building with an authorized, confirmed `scheduled_event` whose start is at or before now and whose end is after now. Future, tentative, cancelled, expired, personal-plan and presence records do not activate the signal. All-day records use the backend's normalized timezone-aware start/end. People are not required. This is separate from the building card, which can show other eligible activity kinds and future events.

The marker artwork is copied from `createManhattanDestinationMarker()` in the reference site's `src/components/map/manhattan/navigation.ts`, lines 9–47, commit `317a243`, SHA25680774bda7068ebb57a05e7062d9be5284df0f379adfdc67c47790f42ddaa7810. The original is a procedural canvas, so no image/model download is added. The reference repository is unchanged.

`server/map/presence.js` authorizes and projects each event's actual `kind`. `src/map-presence.js` passes the complete authorized catalogue to the controller after each successful refresh, and clears it on failure/disposal. `src/main.js` resolves loaded roots, updates indicators before rendering and disposes the controller on HMR. `window.__map.eventIndicators.snapshot()` exposes content-free geometry/resource diagnostics for verification.

The controller shares one canvas texture and two materials. Gold surfaces borrow the complete building's geometry/instance buffers in a separate scene-level, non-raycast decoration group. Original materials, geometry, selection bounds and picking remain unchanged. Bounds include rooftop equipment and exclude decorations; they are cached per root. Resource disposal releases only owned materials/texture. Existing white hover/selection and footprint effects coexist. The exclamation bounces by 12% of its height over 1.4 seconds, and the gold overlay smoothly flashes between 0.08 and 0.26 opacity over 1.8 seconds. Reduced motion keeps the marker stationary and opacity at 0.14. The building itself never moves. Eligibility rescans only on catalogue updates, event boundaries or a backwards wall-clock change; late-loaded buildings resolve on subsequent frames.

## Temporary Go Greek sample

The owner requested a synthetic sample at `683-broadway`. Its reserved identity is defined in `server/map/event-preview.js`:

- Event: `63ebd0ce-1100-4d9b-bdfc-1d9d5d92c55f`.
- Source: `793e578c-b825-46df-a52f-ad762e0412dd`.
- Record: `go-greek-active-event-preview-v1`.
- Title: `[UI TEST] Go Greek sample event`.
- Provenance: `https://example.invalid/tech-nyu/map-debug/go-greek-active-event-v1`.

This is operational fixture data, seeded through Supabase MCP without a schema migration. It has one building link, no participants, category `event`, confirmed scheduled-event kind and a two-hour timed window. The initial sample is active October 21, 2026 from 5:11:04.855 PM to 7:11:04.855 PM America/New_York (21:11:04.855Z–23:11:04.855Z). The insertion receipt is in ignored evidence/map-event-indicators/seed-receipt.json and the milestone journal. Expiry automatically removes it from the card and signal; it does not delete historical rows.

Only a nonproduction API with principal `local-development` can display this exact fixture. Every identity/provenance/title/type/status/kind/building/window check must pass. Reserved provenance cannot fall through to normal authorization, even if another authorizer is permissive. Normal chat/update-agent source reads and writes remain denied. No source catalogue/allowlist/provider data is added, and no Calendar/Discord event is created. Production does not show this sample.

To stop it early, perform a separate owner operation under the map advisory transaction lock, first verify the full exact reserved identity and building link, then set only that sample's status to `cancelled`. Do not alter another event, broaden runtime grants or delete real activities. No cancellation is executed by this guide. Keep applied migration037 immutable.

The Go Greek visual enable switch still controls its model and interactions. With it disabled, the original context tower remains and there is no registered root to decorate. The shared indicator module remains useful for all other buildings and must be preserved during popup removal. A retained sample link means future backend building deletion must stop under the existing foreign-key restriction; disabling the visual is sufficient to retire the popup from the map.

Independent checks live in `tests/map-event-indicators.test.mjs`, `tests/map-event-preview.test.mjs` and `tests/map-event-indicators-browser.mjs`. Desktop overview/selection and mobile overview are verified separately. The later shared camera/card framing fix moves the selected card below the building on narrow screens and fits complete model bounds in the remaining area; see camera-navigation.md. Visual verification and release status are distinct; see the current milestone snapshot.
