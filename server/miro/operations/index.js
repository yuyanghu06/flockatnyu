import { promptText } from '../../prompt-loader/index.js';
import { validateArguments } from '../../automation/validation.js';
import { readMiroMcpConfig, validMiroId } from '../mcp-config.js';
import { createMiroMcpClient } from '../mcp-client.js';
import { MIRO_MCP_TOOLS } from './contracts.js';
import {
  urlFor,
  upstreamUrl,
  blocked,
  quotaNotices,
  quotaFailure,
  invalidRequest,
  sameBoard,
  unpack,
} from './responses.js';
import { miroSvgItems } from './svg.js';
import { bounded } from './fragments.js';

export function createMiroOperations({
  config = readMiroMcpConfig(),
  store,
  client = createMiroMcpClient({ config }),
  now = () => new Date(),
} = {}) {
  async function authorized(boardId, principal, signal) {
    if (
      !config.boardIds?.includes(boardId) ||
      !Array.isArray(principal?.allowedSourceIds) ||
      !principal.allowedSourceIds.length
    )
      return null;
    const result = await store?.authorizedBoard({ boardId, principal, signal });
    const row = result?.data;
    // Registry pins the operator-selected team; the team-scoped MCP OAuth
    // session enforces the user's current board access on every content call.
    // MCP does not return a live authoritative team ID in these read schemas.
    return result?.status === 'ready' &&
      row?.board_id === boardId &&
      principal.allowedSourceIds.includes(row.source_id) &&
      (!config.teamId || row.team_id === config.teamId)
      ? row
      : null;
  }
  function source(board, row, fetchedAt, item, content = false, key) {
    return {
      id: key || `miro:${board}:${item || 'board'}`,
      ...(key ? { sourceKey: key } : {}),
      sourceId: row.source_id,
      kind: 'miro',
      boardId: board,
      ...(item ? { itemId: item } : {}),
      title: String(row.title || promptText('tools/miro/results#title')).slice(0, 300),
      url: urlFor(board, item),
      excerpt: content
        ? promptText('tools/miro/results#excerpt')
        : promptText('tools/miro/results#excerpt.2'),
      retrievalMode: 'live',
      fetchedAt,
      contentAvailable: content,
      ...(content ? { evidenceKind: key?.includes(':row:') ? 'table_row' : 'item' } : {}),
    };
  }
  async function execute({ name, arguments: args, principal, signal } = {}) {
    const tool = MIRO_MCP_TOOLS.find((t) => t.name === name);
    if (!tool || !validateArguments(args, tool.parameters)) return invalidRequest('schema');
    if (!Array.isArray(principal?.allowedSourceIds) || !principal.allowedSourceIds.length)
      return blocked('forbidden');
    if (!config.configured || !store?.configured || !client.configured)
      return blocked('not_configured');
    if (signal?.aborted) return blocked('aborted');
    let retrievalScope;
    try {
      const fetchedAt = now().toISOString();
      if (name === 'list_miro_boards') {
        const boards = [];
        for (const boardId of config.boardIds || []) {
          const row = await authorized(boardId, principal, signal);
          if (row)
            boards.push({
              boardId,
              sourceId: row.source_id,
              teamId: row.team_id ?? null,
              title: String(row.title || 'Miro board').slice(0, 300),
              url: urlFor(boardId),
            });
        }
        return {
          status: boards.length ? 'ready' : 'empty',
          sources: boards.map((b) => ({
            ...source(b.boardId, { source_id: b.sourceId, title: b.title }, fetchedAt),
            retrievalMode: 'catalogue',
          })),
          boardContext: { format: 'miro-catalogue-v1', boards },
          coverage: {
            complete: true,
            reason: 'authorized_catalogue_only',
            returnedCount: boards.length,
          },
        };
      }
      const row = await authorized(args.boardId, principal, signal);
      if (!row) return blocked('forbidden');
      retrievalScope = row;
      let upstream,
        payload,
        nextCursor = null,
        complete = false,
        sources = [source(args.boardId, row, fetchedAt)],
        reason,
        format;
      if (name === 'read_miro_board') {
        const mode = args.mode || 'overview';
        if (
          (mode === 'overview' &&
            (args.patterns || args.cursor !== undefined || args.targetId || args.resultMode)) ||
          (mode === 'search' && !args.patterns?.length)
        )
          return blocked('invalid_request');
        upstream = 'canvas_search';
        const query = {
          miro_url: upstreamUrl(args.boardId),
          result_mode: mode === 'overview' ? 'overview' : args.resultMode || 'matches',
          is_repository: false,
        };
        if (mode === 'search') {
          query.patterns = args.patterns;
          if (args.targetId) query.target_id = args.targetId;
          if (args.cursor !== undefined) query.cursor = args.cursor;
        }
        payload = unpack(await client.callTool(upstream, query, { signal }));
        if (
          !Number.isInteger(payload.total_items) ||
          payload.total_items < 0 ||
          !Number.isInteger(payload.total_results) ||
          payload.total_results < 0
        )
          throw new Error('invalid_mcp_result');
        nextCursor = payload.next_cursor ?? null;
        if (nextCursor !== null && (!Number.isInteger(nextCursor) || nextCursor < 0))
          throw new Error('invalid_mcp_result');
        // Official MCP omits results on a verified empty search. Normalize only
        // this case; missing positive results or contradictory pages fail closed.
        if (payload.results == null && payload.total_results === 0 && nextCursor === null)
          payload = { ...payload, results: [] };
        if (
          !Array.isArray(payload.results) ||
          (payload.total_results === 0 && (payload.results.length > 0 || nextCursor !== null))
        )
          throw new Error('invalid_mcp_result');
        reason =
          mode === 'overview'
            ? 'navigation_overview_only'
            : payload.total_results === 0
              ? 'search_no_matches'
              : 'search_matches_only';
        format = 'miro-mcp-search-v1';
      } else if (args.type === 'table') {
        if (args.scope || args.itemIds) return invalidRequest('table_options');
        upstream = 'table_list_rows';
        payload = unpack(
          await client.callTool(
            upstream,
            {
              miro_url: upstreamUrl(args.boardId, args.itemId),
              limit: args.limit || 5,
              ...(args.cursor ? { next_cursor: args.cursor } : {}),
              is_repository: false,
            },
            { signal },
          ),
        );
        if (
          !sameBoard(payload.miro_url, args.boardId, args.itemId) ||
          !Array.isArray(payload.rows) ||
          payload.rows.length > (args.limit || 5) ||
          !Number.isInteger(payload.total) ||
          payload.total < payload.rows.length ||
          payload.rows.some((r) => !validMiroId(r.rowId) || !Array.isArray(r.cells)) ||
          new Set(payload.rows.map((r) => r.rowId)).size !== payload.rows.length
        )
          throw new Error('invalid_mcp_result');
        nextCursor = payload.cursor ?? null;
        if (
          nextCursor !== null &&
          (typeof nextCursor !== 'string' || !nextCursor || nextCursor.length > 8192)
        )
          throw new Error('invalid_mcp_result');
        complete = !nextCursor && !args.cursor && payload.total === payload.rows.length;
        reason = 'table_rows_only';
        format = 'miro-mcp-table-v1';
        sources.push(
          ...payload.rows
            .filter((r) => r.cells.length)
            .map((r) =>
              source(
                args.boardId,
                row,
                fetchedAt,
                args.itemId,
                true,
                `miro:${args.boardId}:${args.itemId}:row:${r.rowId}`,
              ),
            ),
        );
      } else {
        if (args.cursor || args.limit) return invalidRequest('canvas_options');
        upstream = 'canvas_read_as_svg';
        const ids = [...new Set([args.itemId, ...(args.itemIds || [])])];
        const query = {
          miro_url: upstreamUrl(args.boardId),
          widget_ids: ids,
          is_repository: false,
        };
        if (args.scope)
          Object.assign(query, {
            scope_x: args.scope.x,
            scope_y: args.scope.y,
            scope_width: args.scope.width,
            scope_height: args.scope.height,
          });
        payload = unpack(await client.callTool(upstream, query, { signal }));
        if (
          !payload.success ||
          !sameBoard(payload.miro_url, args.boardId) ||
          typeof payload.svg !== 'string' ||
          !Number.isInteger(payload.item_count) ||
          !Number.isInteger(payload.skipped_count) ||
          payload.skipped_count < 0
        )
          throw new Error('invalid_mcp_result');
        const contentItems = miroSvgItems(payload.svg);
        // Every source comes from a real content-bearing SVG element. Ancestor
        // frames and bare calendar grids never become individual event keys.
        sources.push(
          ...contentItems
            .slice(0, 100)
            .map((item) =>
              source(
                args.boardId,
                row,
                fetchedAt,
                item.id,
                true,
                `miro:${args.boardId}:${item.id}`,
              ),
            ),
        );
        complete = payload.skipped_count === 0;
        reason = 'selected_canvas_only';
        format = 'miro-mcp-canvas-v1';
      }
      const latest = await authorized(args.boardId, principal, signal);
      if (!latest || latest.source_id !== row.source_id || latest.team_id !== row.team_id)
        return blocked('forbidden');
      if (signal?.aborted) return blocked('aborted');
      const result = {
        status:
          nextCursor !== null || (name === 'read_miro_item' && !complete) ? 'partial' : 'ready',
        sources,
        boardContext: {
          format,
          board: { id: args.boardId, title: row.title, url: urlFor(args.boardId) },
          transport: 'mcp',
          upstream,
          payload,
          nextCursor,
          notice: promptText('tools/miro/results#result.boardcontext.notice'),
        },
        coverage: {
          complete,
          reason,
          returnedCount: payload.rows?.length ?? payload.results?.length ?? payload.item_count ?? 0,
          wholeBoardComplete: false,
          ...(payload.skipped_count ? { skippedCount: payload.skipped_count } : {}),
        },
      };
      return bounded(result, args);
    } catch (error) {
      const code = signal?.aborted ? 'aborted' : error?.code || error?.message;
      if (Object.hasOwn(quotaNotices, code)) {
        // Quota is no substitute for current source access, even when the
        // provider failed before its normal successful-response recheck.
        let latest;
        try {
          latest = await authorized(args.boardId, principal, signal);
        } catch {
          return blocked('forbidden');
        }
        if (
          !retrievalScope ||
          !latest ||
          latest.source_id !== retrievalScope.source_id ||
          latest.team_id !== retrievalScope.team_id
        )
          return blocked('forbidden');
        return quotaFailure(code, error);
      }
      return blocked(
        [
          'forbidden',
          'auth_required',
          'request_timeout',
          'response_byte_limit',
          'tool_result_error',
          'content_changed',
          'invalid_mcp_result',
          'invalid_svg',
        ].includes(code)
          ? code
          : 'unavailable',
      );
    }
  }
  return Object.freeze({
    configured: config.configured && store?.configured === true && client.configured === true,
    transport: 'mcp',
    tools: MIRO_MCP_TOOLS,
    execute,
    prepareBoard: ({ boardId, principal, signal }) =>
      execute({
        name: 'read_miro_board',
        arguments: { boardId, mode: 'overview' },
        principal,
        signal,
      }),
  });
}
