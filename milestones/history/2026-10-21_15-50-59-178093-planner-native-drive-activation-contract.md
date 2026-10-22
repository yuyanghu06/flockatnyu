# Native Drive skill activation contract

- Role/scope: read-only planner follow-up; diagnose terminal skill-load skips observed in actual live model outputs.
- Starting state: native activation appends unexecuted assistant/tool turns and skipped results; next model can terminate. Non-native already discards before replanning.
- Contract: after shape/ID validation detect activation, set skill active and continue before committing transcript/IDs for both modes. Discard entire unexecuted turn including mixed writes, emit no execution receipts/progress, consume no executed calls. Preserve prior transcript/results/receipts and all access/mutation limits.
- IDs: discarded proposal IDs may be reused because no committed transcript contains them; committed IDs still forbidden.
- Acceptance: three Drive tool entrypoints, no skipped synthetic results, clean native history, ID reuse boundaries, prior receipts preserved, mixed proposal no early writes, cancellation/catalogue/budget gates unchanged.
- Inputs: assistant-context/provider/chat-runner/Drive skill and native/stable/Drive tests. Existing synthetic-skip test must change. No checks, live calls or edits during planner follow-up.
- Next: coder owns activation block/native tests and guides; parent journals and independent testing follows. Empty final answer remains separate.
