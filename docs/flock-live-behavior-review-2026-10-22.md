> User requested immediate documentation only and stopping other work. Latest truth, including the post-deployment UTC/inheritance/revision failure and unfinished cleanup: [handoff](../milestones/live-planner-calendar-tests/handoff-2026-10-22.md). Prior accepted model checks do not establish acceptance of the newest local correction.

# Flock live behavior review — October 22, 2026

Status: final live check and cleanup in progress. Initial testing found a discovery/ingestion blocker; the user authorized fixing it and continuing. The repair is implemented and independently accepted; migration044 is applied and the matching collector release is live. Private operational observations and synthetic fixture IDs are in ignored `evidence/live-calendar-planner/`.

## Scope and method

Chrome was used to read Discord and send messages. The review covered the original test channel from its beginning; all returned bot mentions/replies in eboard-chat; both pages of43announcement results sinceOctober18; all12pages of290event-team results sinceOctober18, plus current Tech Treks, mentorship, buildathon, dev and social-planning context. Two buildathon bot replies were found by author search. This is relevant current history, not an exhaustive claim about every server channel, old thread, image or linked document. Leadership and other blacklisted sources were not opened. Some long search previews and reply contexts were incomplete.

Calendar reads and authenticated application `read_map_events` / `map/presence` reads verify saved facts independently of bot claims. Content-free Railway logs and planner status verify timing and execution. No scripted model responses or repository test totals are used as evidence of live understanding.

The user corrected the testing method: synthetic messages must sound natural and must not mention testing, QA or the planner. Earlier labeled messages are superseded for autonomous-planner acceptance. They remain evidence only of the explicitly requested chat behavior exercised before that correction.

The old channel was deleted during editing. Fresh natural messages were posted in the user-specified replacement channel1562966336932413602. Every subsequent trigger sends exactly that one channel ID; no omitted/empty whitelist and no history import. Previously queued requests for the deleted channel predate this correction.

## Live results

| Scenario | Verified outcome |
| --- | --- |
| Identity and clarification | Correct existing person resolved; unknown/ambiguous person prompted clarification. Supplied place/time survived the answer. |
| Natural originals without bot mention | Fresh updates queued in the selected channel after the discovery repair. The correct two-input planner cycle timed out at600.418s with no dispatched write. |
| Chat presence with explicit9PM end | Failed: saved1AM instead, four hours late. A subsequent explicit end-only correction also failed to change the value. Bot admitted both failures. |
| Club Calendar create and correction | Passed: one exact provider event, initially6–7PM Bobst204, then same event7–8PM GCASL269; no duplicate or MemberPlans copy. |
| Calendar-to-map correction | Failed in observed one-input planner cycle:600.464s timeout,0/1handled. Exactly one map row remained at old6–7PM/Bobst204 despite correct Calendar facts. |
| Deadline versus event date | Passed in chat: graphic deadline retained asFriday, sessiondateTBD; complete reads found no invented session in either Calendar. |
| Cancellation plus departure | Actual writes passed: Calendar fixture cancelled and Bobst study entry ended. Discord returned a generic failure. This overlapped the web deployment; delivery result is inconclusive for a stable-release regression. |
| Genuine GoGreek “entire time” | User screenshots and exact MCP reads confirmed a separate all-day personal plan beside the original3–5PM event. User-authorized repair transferred attendance and removed only the duplicate; authenticated app projection confirms3–5PM upcoming attendance. |
| Corrected prompt evaluation | Configuredgpt-6-luna with actual runner/services and simulatedbusinessstores: final entire-time3–5attendance, Calendar-onlyno-write, ambiguityclarification and humanconflict preservation pass. Earlier explicitseparateallDay and source-failurehonesty pass with stated version limits.62inference requests including retained failed/inconclusive/cap-cutoff cases. |

The final existing-event prompt fix is web release4eb34f43, SUCCESS. Only three reviewed instruction/description files changed over the previous accepted web release. The production live check and final cleanup receipt are recorded below when complete. No new source grants, schema, identity validation, worker budgets or timeout settings are part of that prompt release.

## Failures and performance observations

1. **Correct map saves produce an unconfirmed answer.** After successful lookup/read/upsert, Flock says its applied receipt has no details to verify the requested label, location or time. Independent application reads prove all of those fields were saved correctly. This leaves the user unsure despite a correct mutation. The chat took about2m53s; map read53.4s, save1.27s. Chrome evidence: `chrome-chat-unconfirmed-save.jpg`; exact saved and cancelled observations are in ignored evidence.

2. **Planner cycles are slow and older retries delay new work.** A completed three-call run waited4m41s then ran9m26s, with only8.3s model generation. Preparation59.6s, Discord111.4s, Calendar67.9s, finishing39s;279.7s cannot be separated further with these logs. Another final handler execution took9m42s/model9.7s. Live worker maxInputs is2. These are observed runs, not a general throughput benchmark.

3. **An older run hit the ten-minute deadline and was requeued.** At23:12:39UTC it timed out after600.8s, including120s preparation and166s+121s Discord reads, with6.3s model generation. The replacement-channel run waited until23:22:42UTC, then failed unavailable before model work. Code inspection confirms oldest queued requests are selected first and requeue preserves original creation order. This supports a queue-starvation risk. The new messages subsequently hit the separate discovery blocker described below; their semantic interpretation remains untested. The obsolete deleted-channel jobs were later removed through MCP. No lease bypass or queue-order fix was attempted.

4. **Completion diagnostics contradict themselves.** `finish_batch` can report ready alongside rejected/unknown, including runs that later complete. Independent review identified an omitted progress-result/dispatched marker in the pipeline branch. Treat this as misleading diagnostics, not proof of rejected business work.

5. **Historical scheduling search stopped too early.** A bot conversation searched two title variants and did not broaden by time/venue even after being asked for similar events. A later retry found the event at the same time and location. Another follow-up returned a generic failure. These are historical Chrome observations, not a fresh reproduction against current code.

6. **Historical location/attendance requests did not save.** Replies acknowledged current presence or a future venue visit without completing the map update; another reported identity failure and another a blocked attendance lookup. Content-free web logs corroborate one forbidden attendance lookup. One earlier exchange only saved after an explicit follow-up asking for the map change. Current identity and explicit clarification tests now pass; natural automatic pickup remains the open test.

7. **Historical replies lost useful conversation context or claimed editing was unavailable.** Event create/cancel follow-ups repeatedly required restating facts or additional retries. Later conversation receipts show successful operations. Do not classify all of those old replies as current permission failures.

8. **Historical long schedule output breaks links at message boundaries.** Chrome shows a Markdown Calendar link ending in one Discord message and continuing as plain URL text in the next, creating broken targets. The reply disclosed partial Calendar coverage and listed all-day/timed duplicates; those data-quality observations are distinct from the link-splitting defect.

9. **Unrequested bug-report side effect was reported by the bot.** A historical presence reply explicitly admitted recording a bug report the user had not requested; another conversational follow-up also reported one. The admission is verified in Chrome. Actual stored report rows were not independently read.

10. **Existing map source-link presentation is incomplete.** One exact Calendar-backed map record matches the active provider event, timing and building, but its presentation URL is null while its source URL is present. The cancelled former provider event is not a duplicate active map record. This is a display limitation, not a Calendar identity failure.

A recent source discussion also supplies a venue for an existing event whose current Calendar record has no location. Whether that source was eligible and actually processed remains unverified; do not call it a proven planner failure yet.

## Discovery blocker and authorized repair

The replacement-channel request waited11m25s and then failed unavailable before model processing. Published channel metadata excluded the new channel; exact live reads returned channel_scope_denied and its two native originals had not entered the input cache. Gateway serially awaits metadata discovery, including archived-thread lists. The running generation began before the channel existed; completing it could not discover that channel. A refresh can also incorrectly accept this older generation and subsequently ignore an unknown-channel original. These are ingestion failures, not evidence of planner misunderstanding.

At23:25:56UTC the old generation completed; a subsequent scan was at archives0/197 at23:29:53UTC and the replacement channel remained unpublished. Scans inspect channel/thread metadata, not historical message bodies. User authorized repairing the blocker and continuing tests. The accepted repair freshly verifies and publishes exact channel/ancestor metadata, preserves manual flags/identities/current policy, fences older scans and removes foreground dependence on archives. Independent actual PostgreSQL/store/Gateway tests prove native ingestion/checkpoints before archive release and safe scanner restart;80focused checks pass. Migration044 is applied through Supabase MCP with service-only invoker ACLs; collector deployment974cb14c is SUCCESS. No timeout/budget change or history import.

The old scanner published the replacement channel at23:42:06UTC before the new collector started; it then began another scan while native input count remained0. Exact authenticated application reads of both originals succeeded at23:45:35UTC with matching IDs/text and no text truncation. Their single-message context coverage is bounded; this is not a full-history coverage claim. Do not attribute that first catalogue publication to the new collector. The collector became ready23:46:19UTC, but Discord reset its session and did not replay older originals. This is a verified recovery gap, not a successful replay. Root used Chrome to edit the same two disposable originals with natural wording, producing normal native updates. Both entered the input cache at23:47:56 and23:48:19UTC. A new manual request adf8ba5a uses only the replacement channel. Actual Calendar/map outcomes remain pending.

Correction to earlier working inference: user-authored messages mentioning FlockBot were present in the input cache. Only bot-generated replies are excluded; a bot mention does not by itself explain missing planner input.

## Cleanup and remaining work

Supabase MCP authentication succeeded. Exact cleanup removed one canceled synthetic map event and cascading people/building relations, two obsolete old-channel manual jobs, seven synthetic input-cache rows and their seven matching input-state entries. Follow-up checks verified absence. Global runner leases, genuine source originals and fixed catalogues were preserved. Complete Calendar reads found no labeled or natural-workshop fixtures at the last check.

The two fresh natural originals remain for retest. Final generated Calendar/map records, temporary inputs/tasks and synthetic job metadata still require exact cleanup after testing. Direct database fallback remains declined; use MCP. Keep source bodies and fixture receipts in ignored evidence, with content-free findings in tracked documentation.

Next: verify actual scoped worker behavior; test natural corrections/cancellations; finish exact cleanup and independently evaluate the evidence.

## Subsequent live results

After fresh native updates, the correct two-input planner run timed out at600.418s with no write dispatched; source/Calendar/person reads succeeded, model generation totaled6.8s. Direct Chrome chat saved presence until1AM instead of9PM NewYork; an explicit end correction failed to change that saved value. Workshop Calendar creation and movement toGCASL269,7–8PM both succeeded on the same provider identity, with no duplicate/MemberPlans copy. Its map projection initially retained old6–7PM/Bobst facts; a single-input scoped cycle is running.

The user supplied a separate genuine GoGreek failure: “the entire time” became a new all-day personal plan beside the existing3–5PM event. Exact MCP reads confirmed the duplicate. User explicitly authorized removal; a locked, guarded transaction copied attendance to the original with inherited hours and removed only the duplicate. Prompt correction/model evaluation are underway. This genuine attendance is excluded from synthetic cleanup.

Attribution correction:91f4f018 is unrelated and aba34044 is the genuine GoGreek exchange; neither is our disposable correction test. Earlier tentative timestamp-based guesses are withdrawn.

## Main confirmed bugs and correction status

1. **Existing-event attendance became an all-day duplicate.** Fixed prompt guidance and exact data repair: existing occurrence lookup, contextual full-window inheritance, strict Calendar-only stop, preserved attendees/human edits. Independent real-model simulated-store verification accepted; live verification is separate.
2. **Natural explicit local end times can save four hours late, and an explicit correction can fail.** Live verified; no timing implementation fix in this testing pass. Both failed operations were disclosed honestly.
3. **Planner processing repeatedly consumes its ten-minute limit before useful completion.** The two-input case used6.8s of model generation; the one-input case used8.58s. Preparation/read authorization/provider wrappers dominate observed time. Fine-grained snapshot timing is unavailable, so do not assign all delay to Discord or the model.
4. **Calendar changes can leave the map stale.** Live Calendar create/move worked, but its map mirror retained old time/building after the forced one-input cycle. No projection performance fix implemented.
5. **Discovery could block new-channel ingestion behind archived-thread metadata scans.** Collector/SQL repair deployed and exact-channel ingestion independently verified. No extra collector service or historical message scan. Startup Discord session reset still lost old originals; editing them produced fresh native updates.
6. **Replies/diagnostics can misrepresent successful work.** Earlier correctsave reported unconfirmed; initialfinish diagnostic can sayready with rejected/unknown. Latest combinedcancel/departure wrote correct changes but returned generic failure during deployment overlap; this last delivery case remains inconclusive.

Historical Chrome-only issues remain separately identified above: narrow search stopping too early, lost follow-up context, broken split Markdown links, blocked attendance and an admitted unrequested bug report. They are not all fresh regressions against the final release.
