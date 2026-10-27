import { PROMPT_ASSETS } from '../server/prompt-loader/assets.js';

// Only literal references from reviewed reachable modules enter an upload.
// A model, request or unrelated Markdown file cannot add a packaged asset.
export function promptAssetsForSources(sources) {
  const allowed = new Set(PROMPT_ASSETS);
  const files = new Set();
  for (const [name, contents] of sources) {
    if (!name.endsWith('.js') || name.startsWith('server/prompt-loader/')) continue;
    const text = contents.toString('utf8');
    const calls = [...text.matchAll(/\bpromptText\s*\(/g)];
    const references = [
      ...text.matchAll(/\bpromptText\s*\(\s*(['"])([a-z0-9_/-]+)(?:#[a-z0-9._-]+)?\1/g),
    ];
    if (calls.length !== references.length) throw new Error('deployment_prompt_reference_invalid');
    for (const reference of references) {
      const path = `prompts/${reference[2]}.md`;
      if (!allowed.has(path)) throw new Error('deployment_prompt_asset_unknown');
      files.add(path);
    }
  }
  return [...files].sort();
}
