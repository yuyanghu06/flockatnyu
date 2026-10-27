import { readdir } from 'node:fs/promises';

// Optional model evaluations pin and copy the implementation behind chat's
// public facade. Reading filenames here does not load services or model clients.
export async function chatSourceFiles() {
  const root = new URL('../../server/chat/', import.meta.url);
  const files = [];
  async function visit(relative = '') {
    const entries = await readdir(new URL(relative, root), { withFileTypes: true });
    for (const entry of entries) {
      const name = relative + entry.name;
      if (entry.isDirectory()) await visit(name + '/');
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push('server/chat/' + name);
    }
  }
  await visit();
  return files.sort();
}
