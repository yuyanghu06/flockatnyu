import { promptText } from '../prompt-loader/index.js';
// Shared by planning and final reporting for both website and Discord chat.
// Intent remains a model decision; backend permissions and revisions still gate writes.
export const chatMapTargetChoicePrompt = promptText(
  'tools/map/chat-workflow#map-target-selection-comes-first-match-the',
);
export const chatMapRecoveryPrompt = promptText(
  'tools/map/chat-workflow#map-state-and-failure-checks-apply-only',
);
export const chatBehaviorPrompt =
  promptText('agents/chat/behavior#tool-operations-are-separate-map-reads-lookups-read') +
  chatMapTargetChoicePrompt +
  ' ' +
  chatMapRecoveryPrompt +
  ' ' +
  promptText('agents/chat/behavior#clarify-only-facts-or-targets-essential-to') +
  promptText(
    'tools/map/chat-workflow#map-updates-plotting-requests-and-current-location-statements',
  ) +
  promptText('tools/map/chat-workflow#attendance-context-a-genuine-attendance-statement-naming') +
  promptText('tools/map/chat-workflow#event-times-and-existing-attendance-an-iso') +
  promptText('tools/map/chat-workflow#map-clock-inputs-for-every-new-or') +
  promptText('agents/chat/behavior#during-execution-compare-returned-saved-fields-and') +
  promptText('agents/chat/behavior#latest-status-and-citations-distinguish-underlying-original') +
  promptText('agents/chat/behavior#final-replies-lead-with-the-relevant-outcome');
