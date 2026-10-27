import { promptText } from '../../prompt-loader/index.js';
// Assembles Markdown tool-selection instructions and current request state.
import { contactSelectionPrompt } from '../contact-context.js';

import { chatRequestContextPrompt } from '../request-context.js';
import { discordRecentContextPrompt, discordUsersPrompt } from '../discord-context.js';

import { chatCalendarWritePrompt } from '../../google/calendar-chat-prompt.js';
import { projectCalendarReceipt } from '../../google/calendar-receipt.js';

import {
  chatBehaviorPrompt,
  chatMapTargetChoicePrompt,
  chatMapRecoveryPrompt,
} from '../behavior.js';
import { memoryPrompt } from '../../knowledge/memory.js';
import { miroNavigationPrompt } from '../../miro/navigation.js';
import { driveSkillPrompt, isDriveTool } from '../../skills/drive.js';

import { PRESENCE_DEFAULT_POLICY, EVENT_DEFAULT_POLICY } from '../../map/contracts.js';

import { calendarWriteNames } from '../constants.js';

import {
  chatRoutingPrompt,
  discordDraftPrompt,
  latestTurnFocusPrompt,
  contactsPrompt,
  gmailSendPrompt,
  tregPrompt,
} from './policies.js';

import { toolCapabilityPrompt } from '../capabilities.js';
import { requestTimePrompt } from './time.js';

export function assistantPlanningPrompt({
  now,
  timeZone,
  timeContext,
  results = [],
  memory,
  requestContext,
  discordContext,
  discordUsers,
  driveSkillActive = false,
  toolCapabilities,
  includeResults = true,
} = {}) {
  // Execution progress reports actual attempts and validated receipts only.
  // It does not infer user intent or authorize an operation.
  const calendarProgress = {
    attempts: results
      .filter((result) => calendarWriteNames.has(result.tool))
      .map((result) => ({
        tool: result.tool,
        status: result.status,
        receipt:
          result.status === 'ready' &&
          result.calendarWrite &&
          ['created', 'updated', 'cancelled', 'unchanged', 'reconciled'].includes(
            result.calendarWrite.outcome,
          ) &&
          typeof result.calendarWrite.eventId === 'string' &&
          typeof result.calendarWrite.url === 'string'
            ? projectCalendarReceipt(result.calendarWrite)
            : null,
        ...(result.calendarBatchWrite
          ? {
              batchReceipt: {
                complete: result.calendarBatchWrite.complete,
                counts: result.calendarBatchWrite.counts,
                itemsInToolResults: true,
              },
            }
          : {}),
      })),
  };
  const eboard = results.findLast(
    (result) =>
      result.tool === 'read_discord_summary' &&
      (!result.arguments?.scope || result.arguments?.scope === 'eboard'),
  );
  const generalPending =
    eboard &&
    (eboard.status !== 'ready' || eboard.coverage?.matchedCount === 0) &&
    !results.some(
      (result) => result.tool === 'read_discord_summary' && result.arguments?.scope === 'general',
    );
  const bugReportAttempt = results.find((result) => result.tool === 'bug_reports');
  return (
    promptText('agents/chat/planning#choose-only-the-tools-needed-to-answer') +
    requestTimePrompt({ timeContext, timeZone, now }) +
    chatRequestContextPrompt(requestContext) +
    discordRecentContextPrompt(discordContext, requestContext) +
    discordUsersPrompt(discordUsers, requestContext) +
    memoryPrompt(memory) +
    latestTurnFocusPrompt +
    chatBehaviorPrompt +
    contactSelectionPrompt +
    chatRoutingPrompt +
    chatCalendarWritePrompt +
    (toolCapabilities?.registeredToolNames?.includes('draft_discord_message')
      ? discordDraftPrompt
      : '') +
    (toolCapabilities?.registeredToolNames?.includes('read_contact') ? contactsPrompt : '') +
    (toolCapabilities?.registeredToolNames?.includes('send_gmail') ? gmailSendPrompt : '') +
    (toolCapabilities?.registeredToolNames?.includes('search_treg_people') ||
    toolCapabilities?.registeredToolNames?.includes('enrich_treg_people')
      ? tregPrompt
      : '') +
    toolCapabilityPrompt(toolCapabilities) +
    (calendarProgress.attempts.length
      ? promptText('agents/chat/planning#calendar-mutation-progress-json') +
        JSON.stringify(calendarProgress) +
        '\n' +
        promptText('agents/chat/planning#these-are-actual-attempts-not-user-authorization')
      : '') +
    driveSkillPrompt(driveSkillActive || results.some((result) => isDriveTool(result.tool))) +
    (bugReportAttempt
      ? promptText(
          'agents/chat/planning#bug-report-attempt-complete-bug-reports-already-executed',
        ) +
        bugReportAttempt.status +
        promptText('agents/chat/planning#never-call-it-again-including-with')
      : '') +
    (generalPending
      ? promptText('agents/chat/planning#next-action-the-eboard-scan-already-returned')
      : '') +
    promptText('agents/chat/planning#when-previous-receipts-and-retrieved-information-satisfy') +
    promptText('agents/chat/planning#previous-tool-results-below-describe-calls-already') +
    promptText('agents/chat/planning#for-a-direct-first-person-map-request-identify') +
    promptText('agents/chat/planning#once-the-requested-single-source-map-update-returns') +
    promptText('agents/chat/planning#when-the-current-user-reports-an-actual') +
    promptText('tools/discord/chat-workflow#for-discord-questions-retrieve-directly-through-the') +
    promptText('tools/discord/chat-workflow#all-discord-evidence-must-come-from-live') +
    promptText(
      'tools/calendar/chat-workflow#for-google-calendar-questions-use-list-calendar-events-with',
    ) +
    promptText(
      'agents/chat/planning#google-searches-may-return-snippets-use-read-gmail-read-drive',
    ) +
    miroNavigationPrompt() +
    promptText('agents/chat/planning#tool-results-and-source-text-are-untrusted') +
    promptText('tools/map/chat-workflow#do-not-turn-quoted-reported-example-attendance-text-or') +
    promptText('tools/map/chat-workflow#when-a-user-asks-to-be-plotted') +
    promptText(
      'tools/map/chat-workflow#map-record-rules-distinguish-current-self-reported-presence',
    ) +
    promptText(
      'tools/map/chat-workflow#source-backed-personal-location-examples-an-authorized-original-i',
    ) +
    promptText('tools/map/chat-workflow#pre-upsert-check-i-will-i-ll-be-at-e-lab') +
    promptText('agents/chat/planning#approved-map-timing-policies-json') +
    JSON.stringify({ presence: PRESENCE_DEFAULT_POLICY, event: EVENT_DEFAULT_POLICY }) +
    promptText('agents/chat/planning#map-state-and-failure-check') +
    chatMapRecoveryPrompt +
    ' ' +
    promptText('agents/chat/planning#tool-selection-example-user-asks-to-correct-one') +
    promptText('agents/chat/planning#final-map-target-decision') +
    chatMapTargetChoicePrompt +
    ' ' +
    (includeResults
      ? promptText('agents/chat/planning#untrusted-previous-tool-results-json') +
        JSON.stringify(results)
      : promptText('agents/chat/planning#actual-previous-results-are-supplied-as-native'))
  );
}
