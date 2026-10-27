import { promptText } from '../../prompt-loader/index.js';
// Assembles Markdown final-answer instructions and bounded references.
import { contactSelectionPrompt } from '../contact-context.js';

import { chatRequestContextPrompt } from '../request-context.js';
import { discordRecentContextPrompt, discordUsersPrompt } from '../discord-context.js';

import { chatCalendarWritePrompt } from '../../google/calendar-chat-prompt.js';

import { chatBehaviorPrompt } from '../behavior.js';
import { memoryPrompt } from '../../knowledge/memory.js';
import { miroNavigationPrompt } from '../../miro/navigation.js';
import { driveSkillPrompt, isDriveTool } from '../../skills/drive.js';

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

export function answerReferenceData(results, sources) {
  const references = new Map();
  sources.forEach((source, index) => {
    const key = JSON.stringify(source);
    if (!references.has(key)) references.set(key, index);
  });
  return {
    results: results.map((result) =>
      Array.isArray(result?.sources)
        ? {
            ...result,
            sources: result.sources.map((source) => {
              const index = references.get(JSON.stringify(source));
              return index === undefined ? source : { sourceRef: index };
            }),
          }
        : result,
    ),
    sources,
  };
}
export function assistantAnswerPrompt({
  sources = [],
  results = [],
  memory,
  timeContext,
  timeZone,
  now,
  requestContext,
  discordContext,
  discordUsers,
  toolCapabilities,
} = {}) {
  return (
    promptText('agents/chat/answer#you-are-flock-the-tech-nyu-shared-club') +
    requestTimePrompt({ timeContext, timeZone, now }) +
    promptText('agents/chat/answer#answer-clearly-and-cite-the-exact-supplied') +
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
    driveSkillPrompt(results.some((result) => isDriveTool(result.tool))) +
    promptText('tools/map/chat-workflow#for-event-attendance-an-applied-map-write-receipt') +
    promptText('tools/discord/chat-workflow#discord-answers-and-on-demand-summaries-must-be') +
    promptText(
      'tools/discord/chat-workflow#if-coverage-complete-is-false-possibly-truncated-is-true',
    ) +
    miroNavigationPrompt() +
    promptText('tools/miro/navigation#for-miro-only-content-available-true-and-actual-retrieved') +
    promptText('agents/chat/answer#upsert-map-event-updates-map-activity-confirm-saving-only') +
    (sources.length ||
    discordContext?.messages?.length ||
    discordContext?.repliedMessage?.message?.content?.length
      ? ''
      : promptText('agents/chat/answer#no-club-knowledge-was-retrieved-from-original')) +
    promptText('agents/chat/answer#in-tool-results-source-ref-n-refers-to-the') +
    promptText('agents/chat/answer#final-answer-phase') +
    promptText('agents/chat/answer#tool-execution-for-this-request-is-finished') +
    promptText('agents/chat/answer#untrusted-tool-status-and-reference-data-json') +
    JSON.stringify(answerReferenceData(results, sources))
  );
}
