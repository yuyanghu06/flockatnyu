# Stylized building portraits

Nine generated architectural portraits cover every current selectable building ID:
Bobst, Courant, Stern, Kimmel, Silver, GCASL, Leslie eLab, Paulson and Washington
Square Arch. Each uses the human avatars' angular low-poly facets, matte warm
colors, upper-left light and ivory background. These are stylized illustrations
of the map models, not official institutional logos or surveyed representations.

`<building-id>-v1.png` retains each full-resolution 1254px square output. The
matching `-v1.webp` is a 256px web thumbnail (all nine total about110KB), derived
with ImageMagick at quality88. Preserve originals and use new versioned siblings
for future design revisions. Person portraits and Supabase URLs are unchanged.

`prompts.json` saves the exact per-building prompt, style reference and model-view
reference. Generation used the built-in image_gen tool, with one call per building.
Eight use existing campus model-view screenshots; the Arch uses its architectural
description. Originals remain in the tool's generated_images folder too.

`src/map-presence.js` bundles only the local WebP URLs and maps their filenames to
stable building IDs. Schedule rows display the portrait left of the building
name/time/activity, at56px (40px on narrow screens). Images are decorative beside
the named building, lazily loaded, and removed safely on an image failure. Source
map geometry, original export files and presence permissions are not modified.
