import { promptText } from '../prompt-loader/index.js';
// Operator-inspected layout hints, never cached event facts or access grants.
// Rediscover current section identities, layout, years and legends through MCP.
export function miroNavigationPrompt() {
  return promptText('tools/miro/navigation#miro-list-miro-boards-authorized-ids-only-hints-grant');
}
