import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareDiscordDeployment } from '../scripts/prepare-discord-deploy.mjs';
import { operationSourceFiles } from './fixtures/chat-source-files.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const loaderPath = 'server/prompt-loader/index.js';
const examplePath = 'prompts/shared/example.md';
const block = (name, body) => `<!-- prompt: ${name} -->\n${body}\n<!-- /prompt -->\n`;

async function temporary(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function fixture(t, source, extra = {}) {
  const root = await temporary(t, 'prompt-loader-copy-');
  const files = { [examplePath]: source, ...extra };
  await mkdir(join(root, dirname(loaderPath)), { recursive: true });
  await copyFile(join(repository, loaderPath), join(root, loaderPath));
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  await writeFile(
    join(root, 'server/prompt-loader/assets.js'),
    `export const PROMPT_ASSETS = Object.freeze(${JSON.stringify(Object.keys(files))});\n`,
  );
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, dirname(name)), { recursive: true });
    if (contents !== null) await writeFile(join(root, name), contents);
  }
  return { root, loader: await import(pathToFileURL(join(root, loaderPath)).href) };
}

test('copied Markdown loader preserves payloads and treats inserted data as literal text', async (t) => {
  const payload = '  {{speaker}}\n{{content}} — 🗽  \n';
  const { loader } = await fixture(t, '# Editable documentation\n\n' + block('message', payload));
  const actual = loader.promptText('shared/example#message', {
    speaker: 'Example member',
    content: '{{speaker}} and <!-- /prompt -->',
  });
  assert.equal(actual, '  Example member\n{{speaker}} and <!-- /prompt --> — 🗽  \n');
  assert.throws(
    () => loader.promptText('shared/example#message', { speaker: 'Example' }),
    /prompt_values_invalid/,
  );
  assert.throws(
    () =>
      loader.promptText('shared/example#message', {
        speaker: 'Example',
        content: 'Hi',
        extra: 'unused',
      }),
    /prompt_values_invalid/,
  );
  assert.throws(
    () =>
      loader.promptText(
        'shared/example#message',
        Object.create({ speaker: 'Example', content: 'Hi' }),
      ),
    /prompt_values_invalid/,
  );
});

test('missing, malformed and unregistered prompt assets fail explicitly', async (t) => {
  const { loader } = await fixture(t, block('body', 'Known wording'), {
    'prompts/shared/missing.md': null,
  });
  for (const reference of [
    '../shared/example#body',
    '/shared/example#body',
    'shared/example.md#body',
  ])
    assert.throws(() => loader.promptText(reference), /prompt_reference_invalid/);
  assert.throws(() => loader.promptText('shared/unknown#body'), /prompt_asset_unknown/);
  assert.throws(() => loader.promptText('shared/example#unknown'), /prompt_block_unknown/);
  assert.throws(() => loader.promptText('shared/missing'), /ENOENT/);
  const duplicate = await fixture(t, block('body', 'First') + block('body', 'Second'));
  assert.throws(() => duplicate.loader.promptText('shared/example#body'), /prompt_block_duplicate/);
  const malformed = await fixture(t, '<!-- prompt: body -->\nMissing closing boundary');
  assert.throws(() => malformed.loader.promptText('shared/example#body'), /prompt_asset_invalid/);
});

test('frozen source inventory copies Markdown with the loader and resolves it independently of cwd', async (t) => {
  const root = await temporary(t, 'prompt-frozen-sources-');
  const outside = await temporary(t, 'prompt-unrelated-cwd-');
  const files = await operationSourceFiles();
  assert(files.includes(loaderPath));
  assert(files.includes('prompts/tools/contacts/read_contact.md'));
  // The same frozen-source inventory used by model harnesses must carry assets.
  for (const name of files.filter(
    (name) => name.startsWith('server/prompt-loader/') || name.startsWith('prompts/'),
  )) {
    await mkdir(join(root, dirname(name)), { recursive: true });
    await copyFile(join(repository, name), join(root, name));
  }
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  const path = 'prompts/tools/contacts/read_contact.md';
  const original = await readFile(join(root, path), 'utf8');
  await writeFile(
    join(root, path),
    original.replace('Read one saved contact', 'COPIED-ASSET-ONLY'),
  );
  const program = `const {promptText}=await import(${JSON.stringify(pathToFileURL(join(root, loaderPath)).href)});process.stdout.write(promptText('tools/contacts/read_contact#description'));`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: outside,
    env: {},
    encoding: 'utf8',
  });
  assert(output.startsWith('COPIED-ASSET-ONLY'));
  assert(!output.includes('Read one saved contact'));
});

test('collector packages only literal referenced prompt assets and rejects dynamic or unknown references', async (t) => {
  const root = await temporary(t, 'prompt-package-fixture-');
  for (const name of ['Dockerfile', 'railway.json', 'package.json', 'package-lock.json']) {
    await mkdir(join(root, 'deployment/discord-worker'), { recursive: true });
    await copyFile(
      join(repository, 'deployment/discord-worker', name),
      join(root, 'deployment/discord-worker', name),
    );
  }
  for (const name of [
    loaderPath,
    'server/prompt-loader/assets.js',
    'prompts/tools/contacts/read_contact.md',
  ]) {
    await mkdir(join(root, dirname(name)), { recursive: true });
    await copyFile(join(repository, name), join(root, name));
  }
  const secretPath = 'prompts/tools/contacts/unreferenced-private.md';
  await writeFile(join(root, secretPath), 'PRIVATE_FIXTURE_MUST_NOT_SHIP');
  await mkdir(join(root, 'server/discord'), { recursive: true });
  const imports =
    "import '@discordjs/rest';import '@discordjs/ws';import {promptText} from '../prompt-loader/index.js';\n";
  const entry = join(root, 'server/discord/event-cli.js');
  await writeFile(
    entry,
    imports + "export const text=promptText('tools/contacts/read_contact#description');\n",
  );
  const result = await prepareDiscordDeployment({ root });
  t.after(() => rm(result.directory, { recursive: true, force: true }));
  assert.deepEqual(
    result.files.filter((name) => name.startsWith('prompts/')),
    ['prompts/tools/contacts/read_contact.md'],
  );
  assert(!result.files.includes(secretPath));
  const docker = await readFile(join(result.directory, 'Dockerfile'), 'utf8');
  assert.match(docker, /^COPY prompts \.\/prompts$/m);
  const ignore = await readFile(join(result.directory, '.dockerignore'), 'utf8');
  assert(ignore.includes('!prompts/tools/contacts/read_contact.md\n'));
  assert(!ignore.includes('unreferenced-private'));
  await writeFile(
    entry,
    imports + "export const text=promptText('unknown/no-asset#description');\n",
  );
  await assert.rejects(prepareDiscordDeployment({ root }), /deployment_prompt_asset_unknown/);
  await writeFile(
    entry,
    imports +
      "const path='tools/contacts/read_contact#description';export const text=promptText(path);\n",
  );
  await assert.rejects(prepareDiscordDeployment({ root }), /deployment_prompt_reference_invalid/);
});
