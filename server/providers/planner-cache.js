// Only the reviewed direct OpenAI planner request uses cache annotations.
// The handler keeps its exact reference schemas for validation and recovery.
const supportedModels = new Set(['gpt-6-luna', 'gpt-6-sol']);
const reference = /^[qt]_[a-f0-9]{8}_[1-9][0-9]*$/;
const clockBoundary = '\n\nTrusted worker clock: ';

function removeReferenceEnum(schema) {
  if (
    Array.isArray(schema?.enum) &&
    schema.enum.length &&
    schema.enum.every((value) => typeof value === 'string' && reference.test(value))
  ) {
    delete schema.enum;
    return true;
  }
  return false;
}

function stableTools(tools) {
  const copies = structuredClone(tools);
  for (const tool of copies) {
    const definition = tool.function;
    const properties = definition?.parameters?.properties;
    if (!properties) continue;
    if (definition.name === 'finish_batch') {
      const scoped = removeReferenceEnum(properties.handledInputIds?.items);
      for (const field of ['noChangeInputIds', 'missingInputIds']) {
        removeReferenceEnum(properties[field]?.items);
        // Exact no-change exclusions stay in the handler's private schema.
        if (scoped && properties[field]?.maxItems === 0) properties[field].maxItems = 20;
      }
      continue;
    }
    removeReferenceEnum(properties.inputIds?.items);
    if (['read_pending_task', 'resolve_pending_task', 'defer_task'].includes(definition.name)) {
      removeReferenceEnum(properties.arguments?.properties?.taskId);
    }
  }
  return copies;
}

export function plannerCacheRequest({ config, auditContext, system, messages, tools }) {
  if (
    auditContext?.agent !== 'planner' ||
    !['openai', 'openai-compatible'].includes(config.provider) ||
    config.baseUrl.replace(/\/$/, '') !== 'https://api.openai.com/v1' ||
    !supportedModels.has(config.model)
  )
    return null;
  const boundary = system.lastIndexOf(clockBoundary);
  if (boundary < 1) return null;
  const stable = system.slice(0, boundary);
  const runtime = system.slice(boundary + 2);
  // Preserve the trusted clock as a system message, separate from source data.
  return {
    messages: [
      {
        role: 'system',
        content: [{ type: 'text', text: stable, prompt_cache_breakpoint: { mode: 'explicit' } }],
      },
      { role: 'system', content: runtime },
      ...messages,
    ],
    tools: stableTools(tools),
  };
}
