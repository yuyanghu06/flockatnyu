import { readFileSync } from 'node:fs';
import { PROMPT_ASSETS } from './assets.js';

const root = new URL('../../prompts/', import.meta.url);
const allowed = new Set(PROMPT_ASSETS);
const cache = new Map();
const referencePattern = /^([a-z0-9_-]+(?:\/[a-z0-9_-]+)*)(?:#([a-z0-9._-]+))?$/;
const placeholderPattern = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;

function load(name) {
  if (cache.has(name)) return cache.get(name);
  const file = `prompts/${name}.md`;
  if (!allowed.has(file)) throw new Error(`prompt_asset_unknown: ${name}`);
  const source = readFileSync(new URL(`${name}.md`, root), 'utf8');
  const blocks = new Map();
  const matches = [
    ...source.matchAll(/^<!-- prompt: ([a-z0-9._-]+) -->\r?\n([\s\S]*?)\r?\n<!-- \/prompt -->$/gm),
  ];
  const starts = source.match(/^<!-- prompt:/gm) ?? [];
  const ends = source.match(/^<!-- \/prompt -->$/gm) ?? [];
  if (starts.length !== matches.length || ends.length !== matches.length)
    throw new Error(`prompt_asset_invalid: ${name}`);
  for (const match of matches) {
    if (blocks.has(match[1])) throw new Error(`prompt_block_duplicate: ${name}`);
    blocks.set(match[1], match[2]);
  }
  // Whole-file assets have one formatting newline; block payloads are exact.
  const text = source.replace(/\r?\n$/, '');
  const asset = { text, blocks };
  cache.set(name, asset);
  return asset;
}

/** Read a fixed server-authored asset. Values are substituted once as text;
 * inserted source data is never interpreted as another template or a path. */
export function promptText(reference, values = {}) {
  const match = typeof reference === 'string' && reference.match(referencePattern);
  if (!match || !values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('prompt_reference_invalid');
  const [, name, block] = match;
  const asset = load(name);
  const text = block ? asset.blocks.get(block) : asset.text;
  if (text === undefined) throw new Error(`prompt_block_unknown: ${reference}`);
  const required = new Set([...text.matchAll(placeholderPattern)].map((item) => item[1]));
  if (
    [...required].some((key) => !Object.hasOwn(values, key)) ||
    Object.keys(values).some((key) => !required.has(key))
  )
    throw new Error(`prompt_values_invalid: ${reference}`);
  return text.replace(placeholderPattern, (_, key) => String(values[key]));
}

export function validatePromptAssets() {
  for (const path of PROMPT_ASSETS) load(path.slice('prompts/'.length, -'.md'.length));
  return PROMPT_ASSETS.length;
}
