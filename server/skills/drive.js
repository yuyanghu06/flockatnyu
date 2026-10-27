import { promptText } from '../prompt-loader/index.js';

// Fixed reviewed asset; model/tool content cannot select a skill path.
const body = promptText('tools/drive/navigation#skill');
const names = new Set(['search_drive', 'read_drive', 'list_drive_folder']);
export const isDriveTool = (name) => names.has(name);
export const driveSkillPrompt = (active) =>
  active ? promptText('tools/drive/navigation#active', { body }) : '';
