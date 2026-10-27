// Installs the existing bounded planning loop using the shared private request state.
import { contactMessagesForModel } from '../contact-context.js';

import { isDriveTool } from '../../skills/drive.js';

import { maxToolCalls, maxPlanningRounds } from '../constants.js';

import { boundedSources } from '../sources.js';
import { toolCapabilitySummary } from '../capabilities.js';
import { assistantPlanningPrompt } from '../prompts/planning.js';

export function installRetrievalPlanning(run) {
  run.plan = async function plan() {
    run.applyPending();
    if (
      run.planning &&
      (run.native || typeof run.provider.planTools === 'function') &&
      run.tools.length
    ) {
      for (; run.roundsUsed < maxPlanningRounds && run.callsUsed < maxToolCalls;) {
        run.applyPending();
        let calls, turn;
        run.auditRound = ++run.roundsUsed;
        try {
          const input = {
            messages: run.native
              ? structuredClone(run.nativeMessages)
              : contactMessagesForModel(run.messages),
            system: assistantPlanningPrompt({
              timeContext: run.requestTime,
              results: run.results,
              memory: run.memoryContext.snapshot,
              requestContext: run.requestContext,
              discordContext: run.discordContext,
              discordUsers: run.discordUsers,
              driveSkillActive: run.driveSkillActive,
              includeResults: !run.native,
              toolCapabilities: toolCapabilitySummary(run.tools, run.principal, run.results),
            }),
            tools: run.tools,
            signal: run.signal,
            timeContext: run.requestTime,
            auditContext: run.auditContext
              ? { ...run.auditContext, round: run.auditRound }
              : undefined,
          };
          if (run.native) {
            // Leave room below the provider's 350KB native envelope bound. Never
            // dispatch a growing context that cannot fit; completed receipts stay
            // in results for truthful final reporting.
            if (
              Buffer.byteLength(
                JSON.stringify({
                  messages: input.messages,
                  system: input.system,
                  tools: run.tools,
                }),
              ) > 300000
            ) {
              run.results.push({
                tool: 'planning',
                status: 'context_limit',
                sources: [],
                reason: 'native_context_budget',
              });
              break;
            }
            turn = await run.waitForTool(() => run.provider.toolTurn(input));
            calls = turn?.toolCalls;
            if (
              !Array.isArray(calls) ||
              calls.length > 8 ||
              typeof turn.text !== 'string' ||
              turn.text.length > 65536 ||
              calls.some(
                (call) =>
                  !call ||
                  typeof call.id !== 'string' ||
                  !/^[a-zA-Z0-9_-]{1,200}$/.test(call.id) ||
                  run.nativeIds.has(call.id) ||
                  typeof call.name !== 'string' ||
                  !/^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/.test(call.name),
              ) ||
              new Set(calls.map((call) => call.id)).size !== calls.length ||
              Buffer.byteLength(JSON.stringify(calls)) > 65536
            )
              throw new Error('invalid_tool_turn');
          } else calls = await run.provider.planTools(input);
        } catch {
          if (Array.isArray(calls))
            for (const call of calls.slice(0, 8)) {
              run.proposalSequence++;
              await run.rejected(
                call,
                run.signal?.aborted ? 'aborted' : 'invalid_tool_call',
                run.signal?.aborted ? 'aborted' : 'invalid_tool_call',
              );
            }
          if (run.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
          run.results.push({ tool: 'planning', status: 'unavailable', sources: [] });
          break;
        }
        if (!Array.isArray(calls)) break;
        if (!calls.length) {
          if (run.applyPending()) continue;
          break;
        }
        // Replan the entire unexecuted turn under the skill before committing any
        // messages, IDs or effects. A skipped result can look terminal to the model.
        const activateDrive =
          !run.driveSkillActive &&
          calls
            .slice(0, 2)
            .some(
              (call) =>
                isDriveTool(call?.name) && run.googleList.some((tool) => tool.name === call.name),
            );
        if (activateDrive) {
          run.driveSkillActive = true;
          continue;
        }
        if (run.native) {
          run.nativeMessages.push({
            role: 'assistant',
            content: turn.text,
            toolCalls: structuredClone(calls),
          });
          for (const call of calls) run.nativeIds.add(call.id);
        }
        const before = run.callsUsed;
        let aborted = false;
        for (const [index, call] of calls.entries()) {
          let result;
          if (run.native) {
            if (run.steering?.hasPending()) {
              run.proposalSequence++;
              result = {
                tool: call.name,
                status: 'superseded',
                reason: 'new_user_input',
                sources: [],
              };
              await run.rejected(call, 'superseded', 'new_user_input');
            } else if (aborted || run.signal?.aborted) {
              run.proposalSequence++;
              aborted = true;
              result = { tool: call.name, status: 'aborted', sources: [] };
              await run.rejected(call, 'aborted', 'aborted');
            } else if (run.callsUsed >= maxToolCalls) {
              run.proposalSequence++;
              result = {
                tool: call.name,
                status: 'budget_exhausted',
                reason: 'request_call_limit',
                sources: [],
              };
              await run.rejected(call, result.status, result.reason);
            } else if (index >= 2) {
              run.proposalSequence++;
              result = {
                tool: call.name,
                status: 'deferred',
                reason: 'round_call_limit_repropose_if_still_needed',
                sources: [],
              };
              await run.rejected(call, 'deferred', 'round_call_limit');
            } else {
              try {
                result = await run.execute(call);
              } catch (error) {
                if (!run.signal?.aborted) throw error;
                aborted = true;
                result = { tool: call.name, status: 'aborted', sources: [] };
              }
            }
            run.nativeMessages.push({
              role: 'tool',
              toolCallId: call.id,
              content: run.nativeContent(result),
            });
          } else if (run.steering?.hasPending()) {
            run.proposalSequence++;
            await run.rejected(call, 'superseded', 'new_user_input');
          } else if (
            index < 2 &&
            call &&
            typeof call.name === 'string' &&
            call.arguments &&
            typeof call.arguments === 'object' &&
            !Array.isArray(call.arguments)
          )
            await run.execute(call);
          else {
            run.proposalSequence++;
            await run.rejected(
              call,
              index >= 2 ? 'deferred' : 'invalid_request',
              index >= 2 ? 'round_call_limit' : 'invalid_arguments',
            );
          }
        }
        if (aborted) throw new DOMException('Stopped', 'AbortError');
        if (run.applyPending()) continue;
        if (before === run.callsUsed) {
          if (
            !run.native &&
            !calls.some((call) => run.tools.some((tool) => tool.name === call?.name))
          )
            break;
          run.results.push({
            tool: 'planning',
            status: 'duplicate_call_skipped',
            sources: [],
            reason:
              'No new calls executed. Reuse previous results, correct invalid calls or return no calls when the request is satisfied. Do not claim registered tools unavailable.',
          });
          if (++run.noProgressRounds >= 3) break;
        } else run.noProgressRounds = 0;
      }
    } else if (run.liveList.some((tool) => tool.name === 'search_discord')) {
      await run.execute({
        name: 'search_discord',
        arguments: { query: run.messages.at(-1).content.slice(0, 500), limit: 5 },
      });
      if (run.applyPending()) return run.plan();
    }
    const sources = boundedSources(run.rows);
    const lastResult = run.results.findLast((result) => result.status !== 'duplicate_call_skipped');
    return {
      sources,
      results: run.results,
      toolCapabilities: toolCapabilitySummary(run.tools, run.principal, run.results),
      ...(run.memoryContext.snapshot ? { memory: run.memoryContext.snapshot } : {}),
      status: sources.length
        ? 'ready'
        : run.accessDenied
          ? 'forbidden'
          : lastResult?.status || 'not_requested',
      ...(run.steering ? { resume: run.plan, timeContext: run.requestTime } : {}),
    };
  };
}
