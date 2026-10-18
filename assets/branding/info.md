# Branding explorations

`tech-at-iridescent-chrome-light-v1.png` is a generated light iridescent chrome @ on white, requested on 2026-10-17. The adjacent prompt text records the exact built-in imagegen instructions. The attached Tech @ supplied the silhouette reference; the attached Luma symbol supplied the material reference.

The numbered PNGs are retained design explorations. The v5 native SVG preserves the approved contour loop; startup now uses the same shape through static masks and composited color surfaces. Other frontend branding is unchanged. Preserve earlier numbered versions when creating alternatives.

`tech-at-iridescent-satin-v2.png` is the requested matte revision: softer pearlescent colors and diffused satin reflections, preserving the white background. Generated with built-in imagegen from v1; exact prompt is saved beside it. V1 remains available.

`tech-at-peach-lilac-matte-v3.png` uses the subsequently supplied peach/blush/orchid/lilac/periwinkle reference palette with the matte finish and white background. Generated using built-in imagegen; exact prompt retained beside it. Earlier variants remain available.

`tech-at-flat-pastel-v4.png` responds to the request for more colors and a quieter flat @: a pastel gradient including peach, yellow, pink, lilac, blue, aqua and mint without raised shading. Built-in imagegen prompt retained beside it; earlier versions preserved.

`tech-at-flat-pastel-v5.svg` is a slightly richer native vector adaptation of approved v4. `tech-at-loading-v5.svg` keeps that traced shape stationary while pastel colors follow its outer spiral, stem and closed inner letter loop in a seamless approximately 2.13-second cycle (50% faster than 3.2 seconds). Embedded reduced-motion CSS holds the complete colored mark still. `scripts/build-brand-loader.mjs` reproduces both using local ImageMagick/Potrace; neither is a video nor a generated replacement of the earlier PNGs. M41 originally wired the animated SVG to startup; M43 replaces runtime SVG painting with composited static-mask color surfaces.

`tech-at-loading-v5-preview.gif` is a 320px, approximately 30fps, 2.13-second browser-rendered preview of the native SVG, exported with infinite GIF repeat. It is a shareable preview only; it is not the startup animation source.

The current animated SVG uses 192 stationary, overlapping curve segments with distance-phased stroke-color animation, softly blended inside the unchanged silhouette. This makes color follow the letter strokes rather than move across a rectangular field. The static fallback remains byte-identical to the original v5.

`tech-at-loading-outer-mask.svg` and `tech-at-loading-inner-mask.svg` are static alpha masks generated from those same routes and traced silhouette. The website clips two prepainted conic-gradient surfaces and rotates only their transforms; heavy map work yields cooperatively. Native SVG/GIF remain export previews. `tech-at-loading-hd.mp4` is a2048px offline SVG render retained as an export; it was rejected as runtime playback because its loop restart stalled during blocked map setup.

`favicon.svg` and `favicon.ico` freeze the native contour at phase zero inside a white square badge with rounded corners with transparent corners. The ICO includes16/32/48px frames. `scripts/build-brand-favicon.mjs` reproduces them; no PNG favicon is used. All three HTML entry pages reference the SVG and ICO.

The rounded-square favicon is a still of the approved native SVG export. The website now uses angular conic-gradient pacing for independent composition; its instantaneous color layout differs from the native export, so earlier native phase-zero pixel checks are not current CSS phase-zero comparisons.

The earlier 65% and original-size favicon trials are superseded: current `faviconMarkScale = 0.8` makes the @ 20% smaller than the original inside the unchanged rounded white badge. It embeds the user-approved raised relief. HTML links use raised-at-80 to refresh icon caches.

The website’s compositor color spin now repeats every 1.422222 seconds after a second requested 50% speed increase. Native SVG/GIF/MP4 exports retain their separately recorded 2.133333-second timing. The static favicon is unchanged.

V6 periwinkle/highlight artwork was tried and rejected by the user on 2026-10-17. `tech-at-periwinkle-v6.svg`, its two v6 masks and its captured HTML preview remain design history only. The website is restored to the previous full-pastel v5 artwork and 1.422222-second compositor spin. Favicon artwork remains independent and unchanged.

`tech-at-raised-relief-v7.svg` adds the user-approved slight raised finish to the existing full-pastel v5 runtime: soft outer/contact shadows, upper-edge light, lower-edge shading and gentle sheen. Its transparent static filters leave the animated colors visible. `build-brand-relief.mjs` reproduces it and an exact runtime-style looping HTML preview. The favicon combines the original native-export still colors with the same relief, at 80% of the original larger size; no PNG favicon is used.

`tech-at-assistant.png` is a transparent256px raster of the current raised favicon mark, with the badge removed. The assistant launcher and panel identity use it; browser favicon SVG/ICO remain unchanged. To reproduce, render favicon.svg in Chrome at256px with transparent HTML/body, remove its direct-child background rect, and capture the SVG with omitBackground.

`tech-at-assistant-hover.svg` matches the transparent assistant PNG framing and raised favicon relief. Its original contour-segment color phases loop every1.422222 seconds. The launcher mounts it only on hover/focus and otherwise shows the PNG; reduced motion stays still. It derives from favicon.svg plus loading-v5 flow-segment classes/delays, retaining the favicon transforms and removing the direct-child backdrop.
