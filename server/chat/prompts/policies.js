import { promptText } from '../../prompt-loader/index.js';
// Selects trusted Markdown policy blocks; loading them executes no service operations.
export const chatRoutingPrompt = promptText(
  'agents/chat/policies#schedule-completion-for-a-schedule-question-without',
);
export const discordDraftPrompt = promptText(
  'tools/discord/chat-workflow#when-draft-discord-message-is-registered-and-the-current',
);
export const latestTurnFocusPrompt = promptText(
  'agents/chat/policies#focus-on-the-latest-user-message-earlier',
);
export const contactsPrompt = promptText(
  'tools/contacts/chat-workflow#contacts-and-leads-the-supabase-contacts-table',
);
export const gmailSendPrompt = promptText(
  'tools/gmail/chat-workflow#gmail-sending-send-gmail-sends-a-plain-text-email',
);
export const tregPrompt = promptText(
  'tools/treg/chat-workflow#treg-people-discovery-enrichment-and-saving-use',
);
