import { promptText } from '../prompt-loader/index.js';
import { canonicalJson, plainObject } from './validation.js';

export function formatResolutionHints(result, toolName, { pipeline, stage, references }) {
  if (
    !pipeline ||
    stage !== 'followup' ||
    !['read_pending_task', 'patch_map_participation', 'finish_batch'].includes(toolName) ||
    !plainObject(result) ||
    !Array.isArray(result.resolutionOptions)
  )
    return result;
  const resolutionHints = result.resolutionOptions.flatMap((option) => {
    const ref = references.toRef.get(option?.taskId);
    if (
      !ref ||
      !['completed', 'no_change_needed', 'source_missing'].includes(option.outcome) ||
      (option.outcome === 'no_change_needed' &&
        !['already_correct', 'no_actionable_request'].includes(option.reason))
    )
      return [];
    return [
      {
        tool: 'resolve_pending_task',
        arguments: {
          inputIds: [ref],
          arguments: {
            taskId: ref,
            outcome: option.outcome,
            ...(option.outcome === 'no_change_needed' ? { reason: option.reason } : {}),
          },
        },
      },
    ];
  });
  if (!resolutionHints.length) return result;
  const visible = {
    ...result,
    resolutionHints,
    resolutionHintNotice: promptText('agents/update/context#resolution-options'),
  };
  return Buffer.byteLength(canonicalJson(visible)) <= 16384 ? visible : result;
}

export function initialTaskCoverage(pipeline, claimedInputIds) {
  if (!pipeline || typeof pipeline.getInitialTaskCoverage !== 'function') return [];
  const coverage = pipeline.getInitialTaskCoverage();
  if (
    !Array.isArray(coverage) ||
    coverage.length > claimedInputIds.length ||
    new Set(coverage.map((row) => row?.inputId)).size !== coverage.length ||
    coverage.some(
      (row) =>
        !plainObject(row) ||
        !claimedInputIds.includes(row.inputId) ||
        !Number.isSafeInteger(row.taskCount) ||
        row.taskCount < 1 ||
        row.taskCount > 500,
    )
  )
    throw Error('preflight_failed');
  return coverage;
}

export async function finishTaskAttempts(pipeline, outcome, signal) {
  if (typeof pipeline?.finishAttempt !== 'function') return;
  const result = await pipeline.finishAttempt({ outcome, signal });
  if (result?.status !== 'ready') {
    const error = Error(result?.status === 'stale' ? 'stale' : 'preflight_failed');
    if (plainObject(result?.diagnostics)) error.diagnostics = result.diagnostics;
    throw error;
  }
}
