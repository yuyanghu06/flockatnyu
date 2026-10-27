// Creates private state for one bounded chat retrieval; helper closures share this request only.
import { contactMessagesForModel } from './contact-context.js';
import { toolDiagnostics } from '../audit/diagnostics.js';
import { createTimeContext } from '../shared/time-zone.js';
import { validateChatRequestContext } from './request-context.js';
import { validateDiscordRecentContext, validateDiscordUsers } from './discord-context.js';
import { randomUUID, createHash } from 'node:crypto';

import { createTregResultCache } from '../treg/result-cache.js';

import { installRetrievalExecution } from './retrieval/execution.js';
import { installRetrievalHistory } from './retrieval/history.js';
import { installRetrievalPlanning } from './retrieval/planning.js';
export async function retrieveAssistantContext({
  messages,
  principal,
  provider,
  liveTools,
  googleTools,
  gmailSendTools,
  requestId,
  miroTools,
  attioTools,
  bugReportTools,
  memoryTools,
  contactsTools,
  tregTools,
  mapTools,
  discordDraftTools,
  buildingId,
  signal,
  steering,
  planning = true,
  now,
  timeZone,
  timeContext,
  onToolEvent = () => {},
  auditContext,
  onAuditEvent = async () => {},
  requestContext,
  discordContext,
  discordUsers,
}) {
  const run = {
    messages,
    principal,
    provider,
    liveTools,
    googleTools,
    gmailSendTools,
    requestId,
    miroTools,
    attioTools,
    bugReportTools,
    memoryTools,
    contactsTools,
    tregTools,
    mapTools,
    discordDraftTools,
    buildingId,
    signal,
    steering,
    planning,
    now,
    timeZone,
    timeContext,
    onToolEvent,
    auditContext,
    onAuditEvent,
    requestContext,
    discordContext,
    discordUsers,
  };
  installRetrievalExecution(run);
  installRetrievalHistory(run);
  installRetrievalPlanning(run);
  run.requestContext = validateChatRequestContext(run.requestContext);
  run.discordContext = validateDiscordRecentContext(run.discordContext, run.requestContext);
  run.discordUsers = validateDiscordUsers(run.discordUsers, run.requestContext);
  run.auditRound = 0;
  run.proposalSequence = 0;
  run.auditEvent = async (event) => {
    try {
      await run.onAuditEvent({
        ...event,
        ...(run.auditContext ? { context: { ...run.auditContext, round: run.auditRound } } : {}),
      });
    } catch {
      /* Audit sink failures do not fabricate tool outcomes. */
    }
  };
  run.waitForTool = async (work) => {
    if (run.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
    let onAbort;
    try {
      return await Promise.race([
        Promise.resolve().then(work),
        new Promise((_, reject) => {
          onAbort = () => reject(new DOMException('Stopped', 'AbortError'));
          run.signal?.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      if (onAbort) run.signal?.removeEventListener('abort', onAbort);
    }
  };
  run.requestTime = createTimeContext(run.timeContext ?? { timeZone: run.timeZone, now: run.now });
  if (!run.requestTime) throw new Error('Invalid request time context');
  run.currentMessage = run.messages.at(-1);
  run.inputRevision = 0;
  run.googleTools = run.googleTools?.createRequest
    ? run.googleTools.createRequest({
        principal: run.principal,
        operationId: createHash('sha256')
          .update(JSON.stringify([run.principal?.id, run.messages]))
          .digest('hex'),
      })
    : run.googleTools;
  run.mapTools = run.mapTools?.createRequest
    ? run.mapTools.createRequest({
        userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
        messages: run.messages.map(({ role, content }) => ({ role, content })),
        principal: run.principal,
        requestContext: run.requestContext,
        discordUsers: run.discordUsers,
        timeContext: run.requestTime,
      })
    : run.mapTools;
  run.attioTools = run.attioTools?.createRequest
    ? run.attioTools.createRequest({
        principal: run.principal,
        userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
      })
    : run.attioTools;
  run.tregResults = run.tregTools?.createRequest
    ? createTregResultCache({ principal: run.principal })
    : null;
  run.contactsTools = run.contactsTools?.createRequest
    ? run.contactsTools.createRequest({
        principal: run.principal,
        ...(run.tregResults ? { tregResults: run.tregResults } : {}),
        userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
      })
    : run.contactsTools;
  run.gmailSendTools = run.gmailSendTools?.createRequest
    ? run.gmailSendTools.createRequest({
        principal: run.principal,
        requestId: run.requestId,
        userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
      })
    : run.gmailSendTools;
  run.tregTools = run.tregTools?.createRequest
    ? run.tregTools.createRequest({
        principal: run.principal,
        tregResults: run.tregResults,
        userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
      })
    : run.tregTools;
  run.discordDraftTools = run.discordDraftTools?.createRequest
    ? run.discordDraftTools.createRequest({
        principal: run.principal,
        requestContext: run.requestContext,
        userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
      })
    : undefined;
  run.results = [];
  run.rows = [];
  run.signatures = new Map();
  run.callsUsed = 0;
  run.liveList = run.liveTools?.tools || [];
  run.googleList = run.googleTools?.tools || [];
  run.gmailSendList = run.gmailSendTools?.tools || [];
  run.miroList = run.miroTools?.tools || [];
  run.attioList = run.attioTools?.tools || [];
  run.contactList = run.contactsTools?.tools || [];
  run.tregList = run.tregTools?.tools || [];
  run.bugList = run.bugReportTools?.tools || [];
  run.memoryList = run.memoryTools?.tools || [];
  run.mapList = run.mapTools?.tools || [];
  run.discordDraftList = run.discordDraftTools?.tools || [];
  run.snapshot = undefined;
  if (run.memoryTools?.read) {
    const started = performance.now();
    await run.auditEvent({ kind: 'tool_started', tool: 'read_memory', status: 'started' });
    try {
      run.snapshot = await run.waitForTool(() =>
        run.memoryTools.read({ principal: run.principal, signal: run.signal }),
      );
    } catch {
      run.snapshot = {
        status: 'unavailable',
        diagnostics: { reason: 'exception', stage: 'execution' },
      };
    }
    await run.auditEvent({
      kind: 'tool_finished',
      tool: 'read_memory',
      status: run.signal?.aborted ? 'aborted' : run.snapshot?.status || 'unavailable',
      diagnostics: toolDiagnostics({
        result: run.snapshot,
        status: run.signal?.aborted ? 'aborted' : undefined,
      }),
      durationMs: Math.round(performance.now() - started),
    });
  }
  if (run.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
  run.memoryContext = {
    snapshot: run.snapshot,
    userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '',
  };
  run.bugReportContext =
    run.currentMessage?.role === 'user'
      ? {
          reportId: randomUUID(),
          userMessage: run.currentMessage.content,
          ...(typeof run.buildingId === 'string' ? { buildingId: run.buildingId } : {}),
        }
      : null;
  run.accessDenied = false;
  run.bugReportAttempted = false;
  run.driveSkillActive = false;
  run.roundsUsed = 0;
  run.noProgressRounds = 0;
  run.conflictTarget = undefined;
  run.conflictReadUsed = false;
  run.tools = [
    ...run.liveList,
    ...run.googleList,
    ...run.gmailSendList,
    ...run.miroList,
    ...run.attioList,
    ...run.contactList,
    ...run.tregList,
    ...run.bugList,
    ...run.memoryList,
    ...run.mapList,
    ...run.discordDraftList,
  ];
  run.native =
    typeof run.provider.toolTurn === 'function' &&
    !run.messages.some((message) => message.attachments?.length);
  run.nativeMessages = run.native ? structuredClone(contactMessagesForModel(run.messages)) : null;
  run.nativeIds = new Set();
  run.nativeResultBytes = 0;
  return run.plan();
}
