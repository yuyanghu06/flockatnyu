# Smaller favicon mark verification

Independent verification of the 65% @ scale inside the existing white rounded-square badge. The main loading animation and map were not modified or rebuilt by the tester.

`results.json` records six passing asset/browser checks. The current viewBox matches the previously recorded value, and the badge dimensions were independently recomputed from the native clip geometry and unchanged crop factor. All 193 path definitions and 192 first-frame segment colors match the source export. Only the mark receives the centered 0.65 scale. No script, style animation or active animation remains in the favicon.

The ICO contains valid 16, 32 and 48 pixel frames, each with transparent pixels at all four corners. All three HTML entry points use the `small-at` cache key. The existing local server returned HTTP200 for both new favicon URLs and served bytes matching the assets on disk.

`preview.png` shows 16/32/64 pixel SVG renders on light and dark backgrounds, next to a reconstructed unscaled mark with the same badge. It was visually inspected: the @ is smaller and remains centered; the badge stays the same size. The previous favicon was untracked and no byte-for-byte prior copy exists, so this is a geometric reconstruction rather than an archived before image. At 16px the reduced mark is very small, consistent with the requested scale.

Chrome155 was used headlessly. Native browser-tab chrome and operating-system icon selection were not captured. A screenshot harness initially attempted HTML content on an SVG document; that harness error was corrected using a fresh HTML page, with only the capture retried. No application failure was found. Full app builds were unnecessary for the bounded asset change.
