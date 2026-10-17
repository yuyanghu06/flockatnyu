import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from '../server/providers/index.js';
import { readConfig } from '../server/config.js';
import { LIVE_DISCORD_TOOLS } from '../tools/discord/index.js';
const DISCORD_SEARCH_TOOL=LIVE_DISCORD_TOOLS.find(tool=>tool.name==='search_discord');
const args = { messages: [{ role: 'user', content: 'What did Pope say today?' }], system: 'Choose safe tools', tools: [DISCORD_SEARCH_TOOL], signal: new AbortController().signal };
for (const provider of ['openai-compatible', 'anthropic']) {
  test(`${provider} parses structured tool selection and sends the provider-native schema`, async () => {
    let call;
    const data = provider === 'anthropic' ? { content: [{ type: 'tool_use', name: 'search_discord', input: { query: 'Pope', mode: 'latest' } }] } : { choices: [{ message: { tool_calls: [{ function: { name: 'search_discord', arguments: JSON.stringify({ query: 'Pope', mode: 'latest' }) } }] } }] };
    const adapter = createProvider(readConfig({ LLM_PROVIDER: provider, LLM_MODEL: 'fixture-model', LLM_API_KEY: 'fixture-secret' }), { fetchImpl: async (url, options) => { call = { url, options, body: JSON.parse(options.body) }; return Response.json(data); } });
    assert.deepEqual(await adapter.planTools(args), [{ name: 'search_discord', arguments: { query: 'Pope', mode: 'latest' } }]);
    assert.equal(call.body.stream, false);
    assert.equal(call.options.redirect, 'error');
    const schema = provider === 'anthropic' ? call.body.tools[0].input_schema : call.body.tools[0].function.parameters;
    assert.equal(schema.additionalProperties, false);
    assert(schema.properties.from);
  });
}
test('tool-planning malformed JSON arguments and upstream HTTP errors remain sanitized', async () => {
  const config = readConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'fixture', LLM_API_KEY: 'fixture-secret' });
  for (const response of [Response.json({ secret: 'fixture-secret' }, { status: 401 }), Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'search_discord', arguments: 'bad-json' } }] } }] })]) {
    await assert.rejects(createProvider(config, { fetchImpl: async () => response }).planTools(args), error => Boolean(error.code) && !error.message.includes('fixture-secret'));
  }
});
