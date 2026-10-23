# Spotlight queue implemented and browser checked

- Acting role / milestone: coder / chat-time-spotlight-queue.
- Scope and owned files: src/assistant.js,src/assistant.css,src/info.md,tests/assistant.test.mjs,tests/assistant-queue-browser.mjs. Existing unrelated changes preserved.
- Implementation: FIFO pending messages capture text,files and selected building; only one request runs and each gets preceding completed history. Separate Stop, per-item Remove, Clear and Resume controls. Stop/failure/incomplete/empty replies retain the active retry and pending messages in a paused queue without overwriting drafts. Hidden processing continues; loading failure pauses/retains; disposal clears/prevents further sends.
- Bounds:10active/waiting messages and20MiBaggregate files across active,pending and draft. Memory-only; reload does not persist the queue. Mobile footer/list scroll within available height.
- Checks: MAP_URL=http://127.0.0.1:5194 node tests/assistant-queue-browser.mjs passed7scenario groups including FIFO/history/files/building/removal,Stop/failure/Resume,hidden/shutdown,count/filebounds,keyboard/offline and compactlayout. Focused assistant/frontendoptimization/presentation/markdown20unitchecks pass; frontend build and gitdiff whitespace pass. Two obsolete unit assertions were adapted to separateStop/transcriptbusy.
- Independent parent evidence: assistant-scroll-browser.mjs passes1280x844,390x844 and390x480; manual scroll preserved and replybottomclearance>=21.5px. Parent inspected desktop and390x320screenshots; composer,Resume and pending list stay reachable.
- Evidence: /tmp/flock-assistant-queue-desktop.png,/tmp/flock-assistant-queue-mobile.png,/tmp/flock-assistant-queue-mobile-keyboard.png.
- Limitations: simulated business transport; installed headless Chrome; native mobile keyboard approximated by viewport. Older standalone scripts assuming Send becomes Stop are not part of current acceptance. No deployment or live business writes.
- Result: coder scope complete/frozen. Independent evaluator reviewing; backend configured-model simulation running separately.
