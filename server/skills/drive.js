import {readFileSync} from 'node:fs';

// Fixed, reviewed server asset; model/tool content cannot select a skill path.
const markdown=readFileSync(new URL('./techatnyu-drive/SKILL.md',import.meta.url),'utf8');
const body=markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
const names=new Set(['search_drive','read_drive','list_drive_folder']);
export const isDriveTool=name=>names.has(name);
export const driveSkillPrompt=active=>active ? '\nTRUSTED SKILL: techatnyu-drive\n'+body+'\nEND TRUSTED SKILL\n' : '';
