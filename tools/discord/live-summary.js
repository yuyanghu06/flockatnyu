import {createTimeContext} from '../../server/time-zone.js';
import { createLiveRetrievalTools, validateLiveDiscordArguments } from './index.js';
import { summarizeLiveDiscordEvidence } from '../../server/discord/live-summary-runner.js';
import { createDiscordSummaryProvider, SUMMARY_FIELDS } from '../../server/discord/summary-provider.js';

// Interactive summaries reuse the verified RAM-only map/reduce path. A bounded
// per-request budget prevents a large live window from creating unbounded work.
export function createLiveChatTools({ service, guildId, config, provider } = {}) {
  const reads = createLiveRetrievalTools({ service, guildId });
  const summaryProvider = provider || createDiscordSummaryProvider({ config });
  const requestBudgets = new WeakMap();
  async function execute(options) {
    if (options.name !== 'read_discord_window' || !config?.configured || summaryProvider.configured === false) return reads.execute(options);
    const requestTime = createTimeContext(options.timeContext);
    const args = requestTime && validateLiveDiscordArguments(options.name, options.arguments, guildId, requestTime);
    if (!args) return { status: 'invalid_request', sources: [] };
    const rawFetched = await service.fetchWindow({ ...args, principal: options.principal, signal: options.signal, timeContext:requestTime });
    const fetched = {...rawFetched,coverage:{...rawFetched?.coverage,timeZone:args.timeZone,from:args.from,to:args.to}};
    const { messages = [], ...visible } = fetched;
    if (fetched.status !== 'ready' || !fetched.coverage?.complete) return visible;
    const rawChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    if (messages.length <= 8 && rawChars <= 10000 && fetched.coverage.sourceTextTruncated !== true) return visible;
    let budget = options.signal ? requestBudgets.get(options.signal) : null;
    if (!budget) {
    let allocated = 0, calls = 0;
    const reservations = new Map();
    budget = {
      async reserveRequest({ reservationId, maxCostUsd }) {
        if (options.signal?.aborted) return { status: 'aborted' };
        if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0 || calls >= 12 || allocated + maxCostUsd > 0.1) return { status: 'budget_exhausted' };
        allocated += maxCostUsd; calls++; reservations.set(reservationId, true);
        return { status: 'ready', reservationId, dispatchAllowed: true };
      },
      async commitUsage({ reservationId }) { return { status: reservations.has(reservationId) ? 'ready' : 'stale' }; },
    };
    if (options.signal) requestBudgets.set(options.signal, budget);
    }
    try {
      const evidence = messages.map(message => ({ messageId: message.id, channelId: args.channelId,
        createdAt: message.timestamp, editedAt: message.edited_timestamp, authorId: message.author.id,
        authorName: message.author.name, content: message.content, replyToMessageId: message.replyToMessageId,
        nonTextNotice: message.hasNonTextContent ? 'Non-text contents were not fetched.' : null,
        url: `https://discord.com/channels/${guildId}/${args.channelId}/${message.id}` }));
      const summary = await summarizeLiveDiscordEvidence({ messages: evidence, config, provider: summaryProvider, store: budget,
        signal: options.signal });
      if (summary.status !== 'ready') return { ...visible, status: 'partial', coverage: { ...visible.coverage, complete: false, reason: summary.status } };
      const sources = SUMMARY_FIELDS.flatMap(field => summary.summary[field].map((finding, index) => ({
        id: `discord-live-summary:${args.channelId}:${args.from}:${args.to}:${field}:${index}`, kind: 'discord_live_summary',
        title: `#${fetched.channel?.name || args.channelId} · ${field}`, excerpt: finding.text,
        url: `https://discord.com/channels/${guildId}/${args.channelId}/${finding.messageIds[0]}`,
        guildId, channelId: args.channelId, periodStart: args.from, periodEnd: args.to, timeZone:args.timeZone,
        retrievalMode: 'live_bot_summary', fetchedAt: requestTime.now,
      })));
      return { status: 'ready', sources, coverage: { ...visible.coverage, complete: true, fetchedComplete: true,
        sourceTextTruncated: false, directSummary: true, returnedCount: messages.length, reason: null } };
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      return { status: 'partial', sources: visible.sources, coverage: { ...visible.coverage, complete: false, reason: 'live_summary_unavailable' } };
    }
  }
  return Object.freeze({ tools: reads.tools, execute });
}
