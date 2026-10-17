# M23 smooth and faster WASD verification

Independent tester evidence for the user's smoother/faster movement request.
The pure suite measures camera/target displacement and input ownership, rather
than duplicating the easing formula. The fresh production Chrome suite measures
real rendered-camera frames and exercises loading, keyboard input, typing,
reset/restore, suspended release, grouped model motion and selection, and overlay
wheel takeover. API status is intercepted; no live backend or model calls occur.

- `tester-report.md`:commands, independent results, findings and handoff.
- `keyboard-results.json`:14passing behavioral groups and numeric traces.
- `browser-results.json`:final browser outcomes, frame traces and limitations.
- `smooth-wasd-overview.png`, `stern-gould-focus.png`:final rendered captures.
- `swiftshader-limited-frames.json/png`:initial software-rendered measurement
  limit (~3FPS), retained separately from accepted default-backend results.
- `raf-clock-measurement-refinement.json`:initial per-frame clock comparison was
  too strict because rAF timestamp and application performance.now differ. Final
  measurements record both clocks and compare short braking windows.
- `selection-contract-fixture.json/png`:intermediate assertion expected selected
  building to clear on outward return; corrected to the existing contract that
  selection persists while camera navigation returns.

The final report distinguishes these test-environment/fixture corrections from
the genuine uncapped-release caller finding, which the coder corrected before
the final production rerun. No evidence establishes subjective physical keyboard
feel, mobile behavior, or other machines' GPU performance.
