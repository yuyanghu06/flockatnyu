import { readdir } from 'node:fs/promises';

// Optional model evaluations pin and copy the implementation behind chat's
// public facade. Reading filenames here does not load services or model clients.
export async function chatSourceFiles() {
  return moduleFiles('server/chat');
}

// Endpoint clients now depend on fixed operation routes and server-owned domain
// services. Keep their complete server/tool source in optional evaluation copies.
// This reads filenames only; it never imports an API, service or provider client.
export async function operationSourceFiles() {
  return (await Promise.all(['server', 'tools', 'src/api/operations'].map(moduleFiles)))
    .flat()
    .sort();
}

async function moduleFiles(folder) {
  const root = new URL('../../' + folder + '/', import.meta.url);
  const files = [];
  async function visit(relative = '') {
    const entries = await readdir(new URL(relative, root), { withFileTypes: true });
    for (const entry of entries) {
      const name = relative + entry.name;
      if (entry.isDirectory()) await visit(name + '/');
      else if (
        entry.isFile() &&
        (entry.name.endsWith('.js') ||
          (folder === 'server' && name === 'skills/techatnyu-drive/SKILL.md'))
      )
        files.push(folder + '/' + name);
    }
  }
  await visit();
  return files.sort();
}
