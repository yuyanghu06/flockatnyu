# Rapid UI refinements

Goal: apply the user’s successive visual and interaction changes directly,
without subagents. Scope includes map event cards, portrait thought bubbles,
and the assistant composer/launcher. Each requested change is complete when its
behavior is implemented, checked at desktop/mobile sizes where relevant, and
recorded in the rolling journal. Current requests pass direct build/targeted
Node/browser checks; later requests continue this user-led iteration. No backend
schema/data changes are part of this UI work. The approved password-page release
is deployed to Railway; latest snapshot links the release receipt. Read milestone.md
and the linked pass records for current details and superseded experiments.

The transcript cutoff now reserves a fixed18px strip outside scrolling messages, above the lower panel inset. Desktop/mobile/short-screen scroll offsets, live resize and manual scrolling pass browser checks; empty composer dimensions are unchanged.

The password-page visual pass replaces all visible form copy/controls with a
massive blinking black cursor centered on white. Accessible native password
entry remains hidden and submits with Enter; no authentication changes. Local
Chrome preview is open for the next user refinement; production is unchanged.

Latest password refinement softens the cursor to rounded gray with a smooth fade,
shifts it slightly left and adds enter password text hidden by native placeholder
state as soon as typing begins. Cursor does not move on typing; password remains
hidden. Direct Chrome typing/clearing and site-auth checks pass.

The cursor/placeholder group now translates30%of viewport width left from the
preceding near-center position; vertical center and password behavior remain.

Latest adjustment moves the group20viewport percentage points right from the
preceding position, with anchor40%minus the responsive offset. Chrome verified.

The cursor now uses an instant1.1s on/off blink instead of fading; rounded gray
appearance and reduced-motion steady state are retained.

Latest password appearance uses gray terminal monospace text and a black SVG
I-beam matching the reference; prior rounded bar/black text are superseded.
Instant blink, position and hidden native password entry remain. Chrome checked.

Current password design supersedes the I-beam with a compact black block cursor,
tighter gray monospace prompt and live local weekday/date/time above. Group is
centered slightly left; typing hides placeholder without a layout shift. Browser
clock/typing checks and7site-auth checks pass. No deployment by this pass.

Latest terminal pass restores white background and uses gray block cursor plus
muted teal tilde. Typing renders length-only asterisks with cursor after them;
long masks remain bounded, and clearing restores placeholder. Clock and native
login remain. Direct Chrome checks and7site-auth tests pass; local only.

Current spacing uses normal monospace tracking, roomier tilde/cursor/placeholder
gaps and20px date-line separation; responsive prompt width stays fixed on typing.

Cursor now uses darker gray#62645f to stand apart from the muted#a19d93 placeholder.

Publication is authorized. Login favicon declaration/root public icon delivery
are fixed with safe-route tests; deployment/push acceptance is tracked in the
latest snapshot and immutable release records.

Password publication is complete: finalRailwayfa9079b3SUCCESS, hostedlogin/icons,
actualsign-in/protectedgate and direct @ startup pass. ExplicitEnter and mask
script tested; syntheticChromeEnter→realbuiltlogo verified. Source pushed;
release receipt under evidence/password-ui. Separate operations work unchanged.

Spotlight updates continue through dismissal and reopen at latest hidden content;
explicit Stop still cancels. Current button treatment uses hover/focus glow and
streaming-only color rotation. Local checks pass; publication tracked in latest
snapshot, separate from concurrent backend quota work.
