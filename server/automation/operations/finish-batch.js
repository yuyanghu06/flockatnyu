import { bindWorkerOperations } from '../../operation-api/adapter.js';

// The handler chooses each bookkeeping step through trusted context. Neither
// model arguments nor the endpoint choose a phase, lease or completion proof.
// Synchronization stays a distinct named tool dispatched by the runner.
export function createFinishBatchOperation({ definition, store, pipeline, validateCompletion }) {
  const parameters = structuredClone(definition.parameters);
  for (const name of ['noChangeInputIds', 'missingInputIds']) {
    parameters.properties[name] = {
      type: 'array',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 20,
    };
  }
  const [operation] = bindWorkerOperations([
    {
      ...definition,
      parameters,
      idempotent: true,
      async execute(args, context) {
        const { principal, signal, step, leaseToken } = context;
        const { handledInputIds, noChangeInputIds = [], missingInputIds = [] } = args;
        if (step === 'validate_initial') {
          return pipeline.validateInitialFinish({
            principal,
            signal,
            handledInputIds,
            noChangeInputIds,
            missingInputIds,
          });
        }
        if (step === 'validate_followup') return pipeline.validateFinish({ principal, signal });
        if (step === 'validate_legacy') {
          return validateCompletion({ handledInputIds, principal, signal });
        }
        if (step === 'checkpoint') {
          return pipeline.finishCycle({
            handledInputIds: [...handledInputIds],
            inputs: structuredClone(context.inputs),
            principal,
            signal,
            leaseToken,
            executionLog: context.executionLog,
            followupStatus: context.followupStatus,
          });
        }
        if (step === 'finish') return store.finish({ leaseToken, handledInputIds, signal });
        throw new Error('invalid_completion');
      },
    },
  ]);
  return operation;
}

export const finishTool = {
  name: 'finish_batch',
  description:
    'Call alone with {handledInputIds}, not the ordinary {inputIds,arguments} wrapper. Include only handled queue UUIDs whose required actions succeeded or were durably deferred. In a staged cycle, [] ends the current phase without claiming additional inputs; unfinished work survives. In legacy mode, [] returns pending and cannot complete the batch. Backend completion checks still apply.',
  parameters: {
    type: 'object',
    properties: {
      handledInputIds: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 20 },
    },
    required: ['handledInputIds'],
    additionalProperties: false,
  },
};
// These tools use only leased task/batch data or already-fetched RAM fragments.
// Their adapters still check principal, source scope and exact task versions.
export const localContextTools = new Set([
  'read_pending_task',
  'defer_task',
  'read_context_fragment',
]);
