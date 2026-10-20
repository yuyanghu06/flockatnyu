# Attendance queue path reviewed

- Local timestamp / acting role / milestone: 2026-10-20T18:50:56.834661-04:00 / independent planner / attendance incident diagnosis.
- Requested scope: read-only trace of the autonomous planner attendance and queue paths.
- Starting repository state: clean working tree; live runtime unchanged.
- Work performed / changed files: reviewed automation prompt/handler/adapters/config, map events/source-access/presence and migrations019/032; no specialist edits.
- Decisions: explicit current attendance requires exact provider identity and source-backed event/location resolution. Generic map tools are available to the worker; matching is model-driven. Oldest eligible inputs are claimed first; failed inputs retain age after a five-minute retry delay.
- Checks and evidence: static inspection only. handler.js aborts a batch on a failed tool and releases inputs. events.js applies a default five-second total service budget while broad reads authorize source records sequentially. Repeated remote authorization is a plausible map-read timeout cause, not proven for the hosted incident. Completion validation does not independently ensure each attendance input caused a participant write.
- Resulting state / acceptance: code trace complete; no tests/model calls/external writes performed by specialist.
- Remaining work and handoff: parent correlates exact private runtime evidence and journals diagnosis. Repair needs independent reproduction before changing timeout, authorization or queue policy.
