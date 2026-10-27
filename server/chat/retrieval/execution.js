// Installs request-bound tool execution, deduplication, audits, conflicts and cancellation checks.
import {
  toolDiagnostics,
  argumentDiagnostic,
  safeDiagnosticTool,
} from '../../audit/diagnostics.js';

import { canonicalJson, validateArguments } from '../../automation/validation.js';
import { normalizeChatMapPersonName } from '../../map/operations/chat-helpers.js';

import { denied, maxToolCalls } from '../constants.js';

import { publicResult } from '../public-result.js';
import { OPERATIONS } from '../../operation-api/catalogue.js';
export function installRetrievalExecution(run) {
  const readRevisions = new WeakMap();
  const retryAfterRead = new WeakMap();
  run.mayRefreshConflict = (call, previous) => {
    if (run.conflictReadUsed || !run.conflictTarget || !previous) return false;
    const ids = run.conflictTarget.ids;
    if (run.conflictTarget.kind === 'contacts')
      return call.name === 'read_contact' && ids.has(call.arguments?.contactId);
    if (run.conflictTarget.kind === 'map')
      return (
        call.name === 'read_map_events' &&
        (ids.has(call.arguments?.eventId) ||
          previous.mapContext?.events?.some((event) => ids.has(event.id)))
      );
    return (
      (call.name === 'read_calendar_event' && ids.has(call.arguments?.eventId)) ||
      (call.name === 'list_calendar_events' &&
        previous.calendarContext?.events?.some((event) => ids.has(event.eventId)))
    );
  };
  run.rejected = async (call, status, reason, extra = {}) => {
    await run.auditEvent({
      kind: 'tool_finished',
      tool: safeDiagnosticTool(call?.name),
      status,
      durationMs: 0,
      diagnostics: toolDiagnostics({
        status,
        reason,
        dispatched: false,
        proposalSequence: run.proposalSequence,
        ...extra,
      }),
    });
  };
  run.execute = async (call) => {
    run.proposalSequence++;
    // A report UUID and immutable payload belong to this current message. Even
    // a failed attempt is final here; changed model arguments cannot retry it.
    const skipped = async (status, reason, extra = {}) => {
      await run.rejected(
        call,
        status,
        reason === 'already_executed' ? 'duplicate_call' : reason,
        reason === 'invalid_arguments'
          ? {
              validation: argumentDiagnostic(
                call.arguments,
                run.tools.find((tool) => tool.name === call.name)?.parameters,
              ),
            }
          : {},
      );
      return { tool: call.name, status, reason, sources: [], ...extra };
    };
    const adapter = run.liveList.some((tool) => tool.name === call.name)
      ? run.liveTools
      : run.googleList.some((tool) => tool.name === call.name)
        ? run.googleTools
        : run.gmailSendList.some((tool) => tool.name === call.name)
          ? run.gmailSendTools
          : run.miroList.some((tool) => tool.name === call.name)
            ? run.miroTools
            : run.attioList.some((tool) => tool.name === call.name)
              ? run.attioTools
              : run.contactList.some((tool) => tool.name === call.name)
                ? run.contactsTools
                : run.tregList.some((tool) => tool.name === call.name)
                  ? run.tregTools
                  : run.bugList.some((tool) => tool.name === call.name)
                    ? run.bugReportTools
                    : run.memoryList.some((tool) => tool.name === call.name)
                      ? run.memoryTools
                      : run.mapList.some((tool) => tool.name === call.name)
                        ? run.mapTools
                        : run.discordDraftList.some((tool) => tool.name === call.name)
                          ? run.discordDraftTools
                          : null;
    if (!adapter) return skipped('invalid_request', 'unknown_tool');
    if (!call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments))
      return skipped('invalid_request', 'invalid_arguments');
    const definition = run.tools.find((tool) => tool.name === call.name);
    // Validation only permits the lookup alias. Invalid arguments keep their
    // original signature and reach normal adapter validation/result recording
    // in both planning protocols; they cannot borrow a valid lookup result.
    let valid = false;
    try {
      if (definition?.parameters) valid = validateArguments(call.arguments, definition.parameters);
    } catch {
      /* Keep original arguments. */
    }
    let signature;
    try {
      const args =
        valid && call.name === 'lookup_map_person' && typeof call.arguments.personName === 'string'
          ? { ...call.arguments, personName: normalizeChatMapPersonName(call.arguments.personName) }
          : call.arguments;
      // A later human correction is a distinct update, even if it restores an
      // earlier value. Creates keep their original run-wide replay protection.
      signature = canonicalJson({
        name: call.name,
        arguments: args,
        ...(OPERATIONS[call.name]?.readOnly && readRevisions.has(adapter)
          ? { readRevision: readRevisions.get(adapter) }
          : {}),
        ...(run.inputRevision &&
        [
          'read_map_events',
          'read_calendar_event',
          'list_calendar_events',
          'read_attio_record',
          'read_memory',
          'update_calendar_event',
          'update_calendar_events',
          'update_attio_record',
          'search_contacts',
          'read_contact',
          'update_contact',
          'delete_contact',
        ].includes(call.name)
          ? { inputRevision: run.inputRevision }
          : {}),
      });
    } catch {
      return skipped('invalid_request', 'invalid_arguments');
    }
    if (call.name === 'bug_reports' && run.bugReportAttempted)
      return skipped('duplicate_call_skipped', 'bug_report_already_attempted');
    const refreshConflict =
      run.signatures.has(signature) && run.mayRefreshConflict(call, run.signatures.get(signature));
    if (run.signatures.has(signature) && !refreshConflict)
      return skipped('duplicate_call_skipped', 'already_executed', {
        previousResult: run.signatures.get(signature),
      });
    if (run.callsUsed >= maxToolCalls) return skipped('budget_exhausted', 'request_call_limit');
    if (run.signal?.aborted) {
      await run.rejected(call, 'aborted', 'aborted');
      throw new DOMException('Stopped', 'AbortError');
    }
    if (refreshConflict) run.conflictReadUsed = true;
    run.signatures.set(signature, null);
    run.callsUsed++;
    const event = { type: 'tool', id: `tool-${run.callsUsed}`, name: call.name };
    const toolStarted = performance.now();
    await run.auditEvent({
      kind: 'tool_started',
      tool: call.name,
      status: 'started',
      counts: { sequence: run.callsUsed },
    });
    if (run.signal?.aborted) {
      await run.rejected(call, 'aborted', 'aborted');
      throw new DOMException('Stopped', 'AbortError');
    }
    // Audit I/O may admit a new human correction. Do not dispatch its old proposal.
    if (run.steering?.hasPending()) {
      run.signatures.delete(signature);
      await run.auditEvent({
        kind: 'tool_finished',
        tool: call.name,
        status: 'superseded',
        durationMs: Math.round(performance.now() - toolStarted),
        counts: { sequence: run.callsUsed },
      });
      return { tool: call.name, status: 'superseded', reason: 'new_user_input', sources: [] };
    }
    run.onToolEvent({ ...event, status: 'running' });
    let result, toolError;
    try {
      result = await run.waitForTool(() => {
        if (run.steering?.hasPending())
          return { status: 'superseded', reason: 'new_user_input', sources: [] };
        if (call.name === 'bug_reports') run.bugReportAttempted = true;
        return adapter.execute({
          name: call.name,
          arguments: call.arguments,
          principal: run.principal,
          signal: run.signal,
          timeContext: run.requestTime,
          ...(adapter === run.liveTools
            ? { userMessage: run.currentMessage?.role === 'user' ? run.currentMessage.content : '' }
            : {}),
          ...(adapter === run.bugReportTools ? { bugReportContext: run.bugReportContext } : {}),
          ...(adapter === run.memoryTools ? { memoryContext: run.memoryContext } : {}),
        });
      });
    } catch (error) {
      toolError = error;
      result = { status: run.signal?.aborted ? 'aborted' : 'unavailable', sources: [] };
    }
    if (result?.status === 'superseded') {
      run.signatures.delete(signature);
      run.onToolEvent({ ...event, status: 'failed' });
      await run.auditEvent({
        kind: 'tool_finished',
        tool: call.name,
        status: 'superseded',
        durationMs: Math.round(performance.now() - toolStarted),
        counts: { sequence: run.callsUsed },
      });
      return { tool: call.name, status: 'superseded', reason: 'new_user_input', sources: [] };
    }
    // Writes can consume exact-read permissions and change saved versions. Let
    // a later model-selected read of this adapter run again; keep write replay
    // protection and the existing targeted conflict-refresh limit unchanged.
    if (
      OPERATIONS[call.name]?.readOnly === false &&
      (toolError ||
        [
          'ready',
          'ok',
          'applied',
          'partial',
          'unavailable',
          'tool_error',
          'read_required',
        ].includes(result?.status) ||
        result?.reason === 'write_outcome_unknown' ||
        result?.sent === 'unknown')
    )
      readRevisions.set(adapter, (readRevisions.get(adapter) || 0) + 1);
    if (
      OPERATIONS[call.name]?.readOnly &&
      ['ready', 'ok', 'empty', 'partial'].includes(result?.status)
    ) {
      // A completed explicit read may supply a rejected action's missing
      // prerequisite. Confirmed or uncertain writes never enter this set.
      for (const rejectedSignature of retryAfterRead.get(adapter) || [])
        run.signatures.delete(rejectedSignature);
      retryAfterRead.delete(adapter);
    }
    if (run.signal?.aborted) {
      await run.auditEvent({
        kind: 'tool_finished',
        tool: call.name,
        status: 'aborted',
        diagnostics: toolDiagnostics({ status: 'aborted', proposalSequence: run.proposalSequence }),
        durationMs: Math.round(performance.now() - toolStarted),
        counts: { sequence: run.callsUsed },
      });
      throw new DOMException('Stopped', 'AbortError');
    }
    if ([run.liveTools, run.googleTools, run.miroTools].includes(adapter))
      result = run.mapTools?.observe?.(call.name, result) || result;
    const status = ['ready', 'ok', 'empty'].includes(result?.status)
      ? 'completed'
      : ['partial', 'metadata_only'].includes(result?.status)
        ? 'partial'
        : 'failed';
    run.onToolEvent({ ...event, status });
    await run.auditEvent({
      kind: 'tool_finished',
      tool: call.name,
      status: run.signal?.aborted ? 'aborted' : result?.status || 'unavailable',
      diagnostics: toolDiagnostics({
        result,
        error: toolError,
        proposalSequence: run.proposalSequence,
        validation:
          result?.status === 'invalid_request'
            ? argumentDiagnostic(
                call.arguments,
                run.tools.find((tool) => tool.name === call.name)?.parameters,
              )
            : undefined,
      }),
      durationMs: Math.round(performance.now() - toolStarted),
      counts: { sequence: run.callsUsed, ...(result?.calendarBatchWrite?.counts || {}) },
    });
    const schemaFailure =
      result?.status === 'invalid_request'
        ? argumentDiagnostic(call.arguments, definition?.parameters)
        : undefined;
    const visible = publicResult(
      call.name,
      call.arguments,
      result,
      run.requestContext,
      schemaFailure,
    );
    run.results.push(visible);
    run.rows.push(...visible.sources);
    if (result?.status === 'conflict') {
      if (call.name === 'upsert_map_event' && typeof call.arguments?.event?.id === 'string')
        run.conflictTarget = { kind: 'map', ids: new Set([call.arguments.event.id]) };
      else if (
        ['update_contact', 'delete_contact'].includes(call.name) &&
        typeof call.arguments?.contactId === 'string'
      )
        run.conflictTarget = { kind: 'contacts', ids: new Set([call.arguments.contactId]) };
      else if (
        ['update_calendar_event', 'delete_calendar_event', 'update_calendar_events'].includes(
          call.name,
        )
      ) {
        const ids = [
          call.arguments?.eventId,
          ...(Array.isArray(call.arguments?.events)
            ? call.arguments.events.map((event) => event?.eventId)
            : []),
        ].filter((id) => typeof id === 'string' && id);
        if (ids.length) run.conflictTarget = { kind: 'calendar', ids: new Set(ids) };
      }
    }
    if (run.liveList.some((tool) => tool.name === call.name) && denied.has(result?.status))
      run.accessDenied = true;
    run.signatures.set(signature, visible);
    if (
      OPERATIONS[call.name]?.readOnly === false &&
      ['read_required', 'conflict'].includes(result?.status)
    ) {
      if (!retryAfterRead.has(adapter)) retryAfterRead.set(adapter, new Set());
      retryAfterRead.get(adapter).add(signature);
    }
    return visible;
  };
}
