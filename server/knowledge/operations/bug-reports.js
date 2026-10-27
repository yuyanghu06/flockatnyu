import { promptText } from '../../prompt-loader/index.js';
import { validateArguments, validUuid } from '../../automation/validation.js';

const text = (maxLength, minLength = 0) => ({ type: 'string', minLength, maxLength });
export const BUG_REPORT_TOOL = Object.freeze({
  name: 'bug_reports',
  description: promptText('tools/bug-reports/bug_reports#description'),
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'observedBehavior'],
    properties: {
      summary: text(200, 1),
      observedBehavior: text(2000, 1),
      expectedBehavior: text(1000),
      stepsToReproduce: { type: 'array', maxItems: 10, items: text(500, 1) },
      context: text(1000),
    },
  },
});

export function createBugReportOperations({ store } = {}) {
  async function execute({ name, arguments: args, principal, bugReportContext, signal } = {}) {
    if (
      name !== BUG_REPORT_TOOL.name ||
      !validateArguments(args, BUG_REPORT_TOOL.parameters) ||
      !args.summary.trim() ||
      !args.observedBehavior.trim()
    )
      return { status: 'invalid_request', sources: [] };
    if (
      !principal?.id ||
      !Array.isArray(principal.allowedSourceIds) ||
      !validUuid(bugReportContext?.reportId) ||
      typeof bugReportContext.userMessage !== 'string' ||
      !bugReportContext.userMessage.trim() ||
      bugReportContext.userMessage.length > 12000
    )
      return { status: 'forbidden', sources: [] };
    if (!store?.configured) return { status: 'not_configured', sources: [] };
    const report = {
      schema_version: 1,
      status: 'new',
      summary: args.summary,
      observed_behavior: args.observedBehavior,
      expected_behavior: args.expectedBehavior || '',
      steps_to_reproduce: args.stepsToReproduce || [],
      context: args.context || '',
      user_message: bugReportContext.userMessage,
      ...(bugReportContext.buildingId ? { building_id: bugReportContext.buildingId } : {}),
    };
    if (Buffer.byteLength(JSON.stringify(report)) > 15000)
      return { status: 'context_limit', sources: [] };
    try {
      return {
        ...(await store.record({ reportId: bugReportContext.reportId, report, signal })),
        sources: [],
      };
    } catch {
      return { status: signal?.aborted ? 'aborted' : 'unavailable', sources: [] };
    }
  }
  return Object.freeze({
    configured: store?.configured === true,
    tools: Object.freeze([BUG_REPORT_TOOL]),
    execute,
  });
}
