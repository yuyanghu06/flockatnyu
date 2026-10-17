import {readDiscordConfig} from './config.js';
import {readDiscordSummaryConfig} from './summary-config.js';
/** Bounded on-demand summaries only; no scheduler, persistence or vector worker. */
export function readDiscordLiveSummaryConfig(env=process.env) {
  const discord=readDiscordConfig(env),summary=readDiscordSummaryConfig(env);
  return Object.freeze({...summary,configured:discord.configured&&summary.configured,maxReduceLevels:16});
}
