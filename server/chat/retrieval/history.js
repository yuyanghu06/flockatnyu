// Installs bounded native-tool history and admitted same-run human corrections.
import { contactMessageForModel } from '../contact-context.js';

import { createTimeContext } from '../../shared/time-zone.js';

import { randomUUID } from 'node:crypto';

import { compactCalendarResult } from './calendar-context.js';

export function installRetrievalHistory(run) {
  run.nativeContent = (result) => {
    let value = result,
      content = JSON.stringify(value);
    if (
      Buffer.byteLength(content) > 64000 ||
      run.nativeResultBytes + Buffer.byteLength(content) > 180000
    ) {
      const savedResult = compactCalendarResult(result);
      if (Buffer.byteLength(JSON.stringify(savedResult)) <= 64000) {
        run.nativeResultBytes += Buffer.byteLength(JSON.stringify(savedResult));
        return JSON.stringify(savedResult);
      }
      value = {
        tool: result.tool,
        status: result.status,
        sources: [],
        complete: false,
        possiblyTruncated: true,
        reason: 'native_context_budget_narrow_the_read',
        coverage: { complete: false, reason: 'native_context_budget' },
        ...(result.sent === false ? { sent: false } : {}),
        ...Object.fromEntries(
          [
            'calendarWrite',
            'calendarBatchWrite',
            'mapWrite',
            'mapFailure',
            'attioWrite',
            'contactWrite',
            'contactImport',
            'bugReport',
            'memoryUpdate',
            'discordDraft',
            'discordDraftCandidates',
          ]
            .filter((key) => savedResult[key])
            .map((key) => [key, savedResult[key]]),
        ),
      };
      // A duplicate's prior receipt remains available even if its source body
      // does not fit. Never turn a successful write into a missing receipt.
      if (result.previousResult) {
        const previous = compactCalendarResult(result.previousResult);
        value.previousResult = {
          tool: previous.tool,
          status: previous.status,
          ...Object.fromEntries(
            [
              'calendarWrite',
              'calendarBatchWrite',
              'mapWrite',
              'mapFailure',
              'attioWrite',
              'contactWrite',
              'contactImport',
              'discordDraft',
              'discordDraftCandidates',
            ]
              .filter((key) => previous[key])
              .map((key) => [key, previous[key]]),
          ),
        };
      }
      content = JSON.stringify(value);
    }
    run.nativeResultBytes += Buffer.byteLength(content);
    return content;
  };
  run.applyPending = function applyPending() {
    if (run.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    const pending = run.steering?.drain() ?? [];
    for (const input of pending) {
      const message = {
        role: 'user',
        content: input.text,
        ...(input.contactContext === undefined
          ? {}
          : { contactContext: structuredClone(input.contactContext) }),
      };
      run.messages.push(message);
      run.nativeMessages?.push(contactMessageForModel(message));
      run.currentMessage = message;
      run.requestTime = createTimeContext({
        timeZone: run.requestTime.timeZone,
        now: input.receivedAt,
      });
      run.inputRevision++;
      run.memoryContext.userMessage = message.content;
      if (run.bugReportContext && !run.bugReportAttempted) {
        run.bugReportContext.userMessage = message.content;
        run.bugReportContext.reportId = randomUUID();
      }
      if (
        run.mapTools?.updateUserContext &&
        run.mapTools.updateUserContext({ messages: run.messages, timeContext: run.requestTime }) !==
          true
      )
        throw new Error('invalid_steering_context');
      run.attioTools?.advanceUserInput?.();
      run.contactsTools?.advanceUserInput?.();
      run.gmailSendTools?.advanceUserInput?.({ userMessage: message.content });
      run.steering.applied(input);
    }
    if (pending.length) run.noProgressRounds = 0;
    return pending.length;
  };
}
