# Flock@NYU interface style guide

This guide records the site's current visual language and how to extend it. It is based on the active source, the supplied Ask Tech@NYU screenshot, and a local Chrome inspection at 1440 × 1000 on October 26, 2026. The map, launcher and assistant dialog were inspected in the browser. Building cards, person notes and administration styles were also studied in source. Synthetic API responses were used; no private contact or club data was needed.

The current interface is a warm, quiet layer over the campus map: ivory surfaces, black text, gently rounded shapes, soft raised edges and small pastel brand accents. New screens should look like another part of that same interface.

## Which styles describe the active site

| Source | What it controls |
| --- | --- |
| [assistant.css](../src/assistant.css) | Bottom-right launcher, assistant dialog, buttons, messages, queues and responsive behavior. This is the closest reference for Contacts. |
| [assistant.js](../src/assistant.js) | Native dialog, focus, keyboard shortcuts, lifecycle and the raised pastel @ mark. |
| [map-presence.css](../src/map-presence.css) | Portraits, person notes, schedule and building cards. Useful references for cards and quiet information hierarchy. |
| [style.css](../src/style.css) | Base font, black text, paper colors, generic controls and older map controls. |
| [config.js](../src/config.js) | Colors used by the 3D scene. Lighting changes their final appearance. |
| [index.html](../index.html) | Initial loading surface, pastel motion and startup layering. |
| [discord-admin.css](../src/discord-admin.css) | Separate administration page; related typography and neutral surfaces, with more conventional borders. |

The page uses `body.map-only`. It hides the older masthead, explorer and toolbar inside `#app`; those selectors remain in the stylesheet for compatibility. Their Georgia headings and older dark-purple buttons are not the main reference for new map overlays. The older [color studies](color-schemes.md) are proposals, not the current visual specification.

## Color palette

Use black for ordinary interface text. Build hierarchy with size, weight, spacing and position rather than making every secondary label pale gray.

| Color | Existing use | Guidance |
| --- | --- | --- |
| `#000000` | `--ink`; normal labels, body text and controls | Default text color. |
| `#FDFAF0` | Assistant surface and neutral map buildings | Main floating controls and Contacts surface. |
| `#FFFEFA` | Assistant replies, person notes and schedule cards | A slightly lighter inner surface. |
| `#FAF8F1` | Base `--paper` | Older panels and generic controls. |
| `#EFEDE4` | User-message inset bubbles | Quiet recessed or selected areas. |
| `#EFEFED` | Tool rows, attachments and code blocks | Compact informational surfaces. |
| `#FFFEF9` | Generic input fill | Warm near-white fields. |
| `#D6D9CC` | Generic input borders | Quiet field boundaries. |
| `#705884` | Assistant accent | Small interaction accents; avoid a purple wash across the whole panel. |
| `#6D5084` | Base `--purple` | Existing related accent; currently a separate literal, not a shared universal token. |
| `#8F72AA` | Base keyboard focus outline | Visible focus for new form controls. |
| `#965D45` | Assistant error text | Existing warm error tone; use with a clear message, not color alone. |
| `#737373` | Event date/time exception | Existing event metadata treatment, not the default for ordinary text. |

The brand @ and busy send control use these pastel stops: peach `#F0BA72`, yellow `#F3D578`, pink `#F18FAD`, orchid `#E78CE5`, lilac `#AE91EC`, blue `#7EACF0`, aqua `#78D6DB`, mint `#91DCB2`. Keep the established artwork; do not create a different rainbow for every action. A normal Contacts save button does not need an animated gradient.

The 3D palette is related but separate: context buildings `#FDFAF0`, ground `#C4C7C3`, grass `#9DBD7C`, sky top `#94BDD7`, horizon/background `#DCE6E8`. Do not alter scene materials when adding an HTML panel. The renderer's lighting, fog and tone mapping explain why these colors look different across the map.

## Surfaces, edges and shadows

Large foreground objects have warm, nearly opaque fills. They are separated from the map by light on their upper-left edges, a slightly darker lower-right inset and a broad outer shadow. Small controls use a quieter version of the same treatment.

The existing assistant's edge recipe is:

```css
--assistant-surface: #fdfaf0;
--assistant-edge:
  inset 1.5px 2.5px 4px #fff9,
  inset -2px -3px 6px #20233b55;
```

The launcher adds:

```css
box-shadow:
  var(--assistant-edge),
  0 3px 10px #24382e0a,
  0 10px 35px #24382e1c;
border: 0;
border-radius: 16px;
```

The assistant dialog adds:

```css
box-shadow:
  var(--assistant-edge),
  0 2px 4px #22362d06,
  0 18px 75px #293b3938,
  0 0 0 1px #424c3a0d;
border: 0;
border-radius: 22px;
```

A native dialog backdrop uses `#34443D1F` with `blur(3px)`. The launcher itself declares `blur(18px)` and the assistant panel `blur(24px)`; their ivory fills remain the main visible surface. Avoid multiplying heavy shadows on nested list rows, fields and every small icon. Use a faint divider or a shallow inset for inner structure.

These recipes are currently component-scoped. This guide gives shared references; it does not claim that every component already uses a single global shadow or surface variable.

## Type, spacing and shape

The declared font stack is Inter followed by system sans-serif fonts. The site does not load a separate web-font file in the inspected entry/styles, so Inter availability depends on the system. Keep the fallback stack; do not introduce a font download for this screen.

| Element | Current measurement or rule |
| --- | --- |
| Assistant launcher | 12px, weight 550; minimum height 46px desktop / 44px mobile; 14px horizontal padding; 10px content gap. |
| Logo | 28px in launcher, 24px in assistant header. |
| Shortcut badge | 10px; 3px × 5px padding; 5px corners; faint border. Hidden on mobile. |
| Assistant header | 12px/650 identity; 20–24px horizontal spacing. |
| Assistant message | 13px with 1.7 line height; plain black text. |
| Assistant prompt input | 23px desktop / 20px mobile. This oversized search-like input is specific to chat. |
| Building activity title | 14px/650. Metadata 12px; date/time bold. |
| Larger card heading | Approximately 25–26px, weight 600. |
| Common radii | 5–7px badges/small controls; 8–12px inner items; 16px assistant launcher; rounded-square Contacts avatar;18–22px floating cards/dialogs. |

For new contact forms use readable 13–14px field text, 11–12px labels and roughly 20–24px panel padding. Name fields can share a row when there is room; Notes should occupy the full width. Prefer 8px, 12px, 16px and 24px gaps rather than arbitrary one-off spacing. Long names, emails and notes must wrap within their containers.

## Layout and div structure

The map remains the full-screen background. Small launchers sit at the bottom-right; opening a task brings forward one focused dialog. Avoid permanent navigation bars or a dashboard frame around the map.

Use flex for short action rows and grid for list/detail or label/value layouts. A useful component structure is:

```text
launcher row — flex, consistent gap, shared fixed placement
├── Contacts profile-avatar button
└── Ask Tech@NYU button

Contacts native dialog — constrained to viewport
├── header — heading, Add contact action, close button
└── body — grid on desktop
    ├── contact list — search, results, empty/error state, Load more
    └── selected contact — details or six-field editor, actions, feedback
```

Keep the visible buttons in normal flex layout. Do not calculate the Contacts position from a guessed assistant width; shortcut labels and screen size can change that width. Put floating UI outside the hidden legacy `#app` children, or use an explicit supported mount.

Scrollable list/details containers need `min-width: 0`, `min-height: 0` and bounded overflow. Keep the dialog header and essential actions reachable while content scrolls. Use real buttons, inputs and headings rather than clickable generic divs.

## Implemented Contacts dimensions

The Contacts implementation uses the shared surface recipes above with these concrete values:

| Part | Implemented value |
| --- | --- |
| Launcher row | Flex row, 10px gap (8px below 600px); Contacts left of Ask Tech@NYU. Ask retains its 12px/550 label. Contacts is an icon-only profile avatar; both retain 46px desktop / 44px small-screen minimum height. |
| Desktop dialog | Maximum 920px wide; 650px high when space permits; viewport-constrained; 22px corners. |
| Desktop body | Grid: 280px list column plus a flexible detail column. Rows scroll independently; Search, count and Load more remain visible. Detail padding `27px 32px 24px`. |
| Narrow layout | At 640px or below, list and detail occupy the same space with an All contacts Back action. Dialog is viewport width minus 24px, up to 700px tall, with 19px corners. |
| Form layout | Two columns when space permits; one column below 370px; Notes spans both. Field text 13px desktop / 14px mobile. |
| Selected row | Pale lilac `#E9E3EF`; normal text stays black. |
| Fields | Warm `#FFFDF6` fill, 9px corners and inward gray/ivory inset shadows; focused fields retain that depth plus a neutral inset focus border/shadow. |
| Contacts motion | Matches Spotlight: 380 ms opening from 88% scale through 102.5%/99.5% overshoot to 100%; 180 ms closing to 90% with backdrop fade. Reduced motion is immediate/static. |

## Contacts screen direction

The Contacts implementation extends the palette and surface rules above; its final selectors and dimensions live in [contacts.css](../src/contacts.css).

- Use an icon-only person profile avatar beside the existing launcher, with no visible Contacts text or address-book symbol. Keep the accessible name **Open contacts**. Its pastel highlights follow the original @ palette and hover/focus animation; reduced motion keeps it static. Retain the original @, Ask label and shortcut behavior.
- Keep the Contacts header to its title and actions; do not add a subtitle or tagline.
- Use a wider version of the existing rounded dialog. Desktop has a searchable list and a detail/editor pane. Mobile switches between those views with a clear Back action.
- Show name, email or workplace in list rows without inventing missing personal details. Use a quiet selected treatment, not a large saturated block.
- Use the six labels **First name**, **Last name**, **Email**, **Phone**, **Workplace**, **Notes**. Keep normal text black and fields warm near-white.
- Existing fields are editable immediately. Save/Cancel appear only for changes; there is no separate Edit button. Notes is larger and spans the form.
- Keep the profile avatar left of name/workplace with an accessible 34px red rounded-square × on the right; it opens explicit confirmation naming the selected contact. List/detail avatars and gray Load more have soft highlights and outward shadows. Search matches the inward field treatment at rest and focus.
- Keep the title-only header and omit the sample/reset footer in the real UI.
- Submit only changed fields on edits. Keep the draft if saving fails or conflicts. Show success only after the API confirms it.
- Loading, empty, no search matches, unavailable, conflict and uncertain-save states need distinct plain-English messages. Do not replace an unavailable result with a misleading empty list.

The manual contact screen uses authenticated contacts-only HTTP routes. It does not send form text to the model. Contact data remains out of local storage, console logs and unrelated services. See [contacts.md](contacts.md) for the data and version rules.

The Contacts launcher is now a 46px rounded-square ivory button with 16px corners (44px mobile) with a 31px head-and-shoulders symbol without a surrounding ring and no visible label. Its stationary SVG mask clips a rotating conic color disc; a static sheen adds depth. The disc uses the same eight colors and 1.422222-second period as the @ logo, animates only on hover or keyboard focus, and stays static at rest or with reduced motion. The accessible button name remains Open contacts. This replaces the earlier labeled address-book control.

## Interaction and motion

The existing launcher and dialog enter over approximately 380ms with a small scale overshoot. Assistant dismissal is 180ms. The composer changes height over 280ms. Use short, quiet transitions; avoid motion on every row or field.

Honor `prefers-reduced-motion`: no scale/overshoot, spinning decoration or animated shimmer is needed when reduced motion is requested. An action's loading state should still be understandable without animation.

Use a native modal dialog for focus containment. Close, Escape and backdrop dismissal restore focus to the launcher. Protect a user's unsaved draft during errors or deliberate navigation. Contacts keyboard and pointer events must not move the map, and the assistant shortcut must not open a second modal while someone is typing in Contacts.

Existing assistant controls use a subtle focus brightness change rather than an exterior outline. Contacts uses neutral inset field-border/shadow changes and quiet button brightness for keyboard focus. Purple exterior focus rectangles are removed; the warm white field boxes remain. Decorative SVG icons should be hidden from assistive technology when a visible label already names the action.

## States and accessibility

- Every form field has a visible programmatically associated label; placeholders supplement labels.
- Explain errors next to the affected form or action, and announce save/error results through a status region.
- Disable duplicate submissions while a save/delete is pending. An uncertain response must not encourage a blind repeat.
- Keep a comfortable touch area around icons and actions, approximately 44px where practical, even when the drawn icon is smaller.
- Render saved notes and other contact text as text, never HTML or instructions. Long text must not create horizontal page overflow.
- Keep all controls usable at narrow mobile widths and in short landscape viewports.

## Before extending another component

Check the actual active component in the browser, including hover/focus, loading, error, mobile and reduced motion. Reuse its surfaces and spacing. Verify the browser → API → saved-data → response path with synthetic data, then inspect screenshots rather than relying on a successful build alone.

The style baseline is recorded in `evidence/contacts-ui/baseline-computed-styles.json` and the companion desktop/assistant screenshots. Those ignored local artifacts are evidence, not runtime assets. The [milestone snapshot](../milestones/milestone.md) records current implementation, verification and deployment status. This guide does not select the older neon/dark color proposals or redesign the map.

The base Contacts UI was verified and released, with actual hover/focus pixels and static resting/reduced-motion behavior checked. Filters and motion have separate browser/API/model evidence. The milestone records the latest actual hosted release and the limits of simulated mutation tests.

Contacts empty list: hide empty count metadata and place the empty heading/helper about12px below Search. Omit the redundant Add your first contact link; keep the header Add contact control. Populated counts and loading messages retain their normal spacing.

Contacts filters: 36px raised pastel funnel beside Search. Inactive/closed is a colored outline; open or applied-active is filled. The compact panel contains Name, Workplace, Email/Phone presence and Sort, with Apply and Reset. Apply resets paging, Reset preserves the global query, and neither discards an edited contact. Escape closes filters before the Contacts dialog.





Contacts now separates scrolling fields from the action row. The field viewport clips enlarged Notes above a normal footer, preventing content from showing behind or beneath the buttons. The footer keeps its own warm surface and bottom inset. Sticky positioning and fixed focus-padding workarounds are retired.

Flock it! is a neutral raised action beside the profile's red delete X. Selecting it opens Flock with a small removable first/last-name chip inside the prompt column, alongside the existing attachment/send layout. Do not print the contact's profile, email or UUID into the visible prompt or chat bubble. Keyboard focus and wrapping must remain usable on narrow screens. Refresh sits to the left of Add contact in the directory header and preserves draft edits.
