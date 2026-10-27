# Markdown prompts with the configured live model

Goal: check real model behavior after the prompt-source restructuring.

Scope: the configured gpt-6-luna model, actual production chat/update runners and adapters, source-pinned Markdown assets, and simulated sources/storage. Only the exact configured inference endpoint may receive network requests. No real business reads/writes, deployment or prompt wording changes.

Plan: three Contacts conversations (update with preservation, ambiguity, unavailable data) with 12 actual HTTP requests maximum; five prompt-audit conversations (worker outage/task preservation, quoted no-write, attendance, DST, conflict/preservation) with 28 maximum. Total hard limit: 40 HTTP inference requests, including retries. A sole tester executes inference; root does not issue separate model calls.

Completion criteria: inspect actual proposed calls/arguments, attempted/applied writes, exact saved fields, final replies and surviving tasks; retain failures/cap stops; review real results independently and report actual model/request counts and limits. These simulations do not mark real-service task checklist rows as live passes.

Final budget accounting: original batch40/40 stopped immutably. Separate followup used10 of its12 allowed HTTP requests, only unavailable Contacts and map conflict. Combined actual50, maximum52; no further inference. Original model/fixture/source bytes were unchanged across both freezes.
Current state: Configured gpt-6-luna completed 50 actual inference HTTP requests across the original 40-request batch and a separately announced 10-request followup, within the combined maximum of 52. All HTTP responses succeeded, sources/all 87 Markdown assets stayed pinned and no relevant workspace drift occurred. Independent semantic review confirms six of eight scenarios worked as intended, including exact Contact updates, unavailable-data honesty, worker intent retention, quoted no-write, attendance preservation and conflict recovery. Two real failures remain: mutating an ambiguous same-name Contact before clarification, and repeating complete-empty Calendar reads until the evaluation cap without answering. Original narrow assertion failures and cap-limited attempts remain preserved. Verification itself is ACCEPTED; full behavioral acceptance is REQUEST CHANGES. No prompt/runtime changes, live business data operations or deployment occurred.

Next action: Report the live-model findings. Prompt/runtime fixes and any production release are separate work; no blanket all-pass claim is warranted.

[Scenario results, evidence and limitations](verification.md).

Later selected [Contact/Calendar prompt corrections](../prompt-clarification-completion-2026-10-27/verification.md) pass both original failure reproductions. The original failed records remain unchanged; see that later milestone for actual retest qualifications.
