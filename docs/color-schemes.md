# Tech@NYU campus map color studies

Open [the interactive color samples](color-schemes.html) in a browser. Switch
between three proposals to compare actual UI colors over a map screenshot.
These samples do not change the application theme. The card and location tag
are interface mockups, not live controls or fabricated club events.

## Brand evidence

Inspected on 2026-10-10:

- [Tech@NYU’s current website](https://techatnyu.org/): near-black surfaces,
  white typography and green/purple accents. Its delivered CSS includes
  background `#0A0A0A`, foreground `#EDEDED`, and several green/purple variants.
- [Jennifer Huang’s 2025 rebrand case study](https://hfyj-art.com/techatnyu):
  the designer’s published brand board labels neon cyan green `#4DFF94` and
  purple `#AA55CE`. These anchor the proposals below. The board also identifies
  Satoshi and Forma DJR Display; this preview uses installed system fonts and
  does not redistribute those font files.

The board and homepage were actually viewed; screenshots are retained under
`evidence/m3-campus-details/reference-technyu-*`. These are visual references,
not a claim of a comprehensive, formally supplied brand manual. Proposed neutrals,
darkened accents and lavender variants are extensions, not official brand tokens.

## Proposed tokens

| Role | 01 Neon graphite | 02 Daylight campus | 03 Violet dusk |
| --- | --- | --- | --- |
| Background | `#090D0B` | `#E7EDE5` | `#17151E` |
| Panel | `#151D19` | `#F6F7F1` | `#27222F` |
| Primary text | `#F2F8F3` | `#1E3026` | `#F5F0F8` |
| Secondary text | `#B5C6B9` | `#516457` | `#C7B9D1` |
| Primary action | `#4DFF94` | `#167748` | `#4DFF94` |
| Action text | `#092011` | `#FFFFFF` | `#17221C` |
| Secondary accent | `#AA55CE` | `#714289` | `#C68ADC` |
| Selected location | `#4DFF94` | `#167748` | `#C68ADC` |
| Panel border | `#34483A` | `#CDD8CE` | `#51415E` |

**Recommendation: Neon graphite.** It most closely reflects the current club
identity and makes controls clear over the warm architectural scene. Use neon
sparingly: one selected location and one primary action, with purple reserved for
secondary emphasis. Do not apply a neon wash to every building.

**Daylight campus** preserves the existing light-panel feel while bringing in
Tech@NYU accents. The darker green is intentional: original neon green is difficult
to read as small text on cream. Keep original neon for small decorative markers.

**Violet dusk** puts more emphasis on purple surfaces while retaining green actions.
Use lighter lavender for small accents on dark panels, rather than assuming the
original purple works for every text size/background.

## Text contrast calculations

Calculated from the proposed sRGB foreground/background pairs using relative
luminance. These check the listed pairs only, not a complete accessibility audit.

| Pair | Neon graphite | Daylight campus | Violet dusk |
| --- | --- | --- | --- |
| Body text / panel | 15.96:1 | 12.94:1 | 13.79:1 |
| Secondary text / panel | 9.61:1 | 5.89:1 | 8.32:1 |
| Action text / action fill | 13.09:1 | 5.58:1 | 12.52:1 |

Focus indicators and selected borders supplement color; selected items should
also retain a name/label. Purple on the brand board is primarily decorative in
the graphite proposal. The interactive document’s controls include keyboard focus
and pressed state; sample action cards are deliberately non-interactive.

## Applying a chosen direction later

Map interface tokens to CSS variables in `src/app/style.css`; assign selection/hover
colors centrally in `src/map/data/config.js`. Keep current photographic material treatment
for Paulson, Silver, Leslie and Stern/Courant. Ground, grass and atmospheric tones
can be adjusted separately after checking facade recognition and model contrast.

The preview does not recolor the 3D renderer: it compares interface colors over
the same current map image, so the alternatives are easy to compare. A full scene
lighting treatment would require a separate live visual pass once a direction is
chosen. No font purchase, external publication, or live palette change is implied.
