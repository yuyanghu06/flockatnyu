/** Attaching real files to an event.
 *
 * Discord CDN links are signed and expire within about a day, so storing the
 * URL off someone's message gives marketing a dead link later. Instead the bot
 * re-uploads the files into the marketing channel — a message it owns — and
 * stores a permanent jump link to that message.
 *
 * The file list comes from the context-menu interaction itself (stashed in
 * `pending_assets`) rather than from a later REST fetch, which needs extra
 * channel permissions and doesn't reliably return attachments.
 */

import { config } from "./config";
import { postFiles } from "./discord";
import { EventRow, getPendingAssets, mergeDetails } from "./store";

/** Non-boosted servers cap uploads at 10 MB; leave headroom. */
const MAX_BYTES = 9 * 1024 * 1024;

export interface AttachResult {
  ok: boolean;
  message: string;
}

export async function attachToEvent(
  event: EventRow,
  sourceMessageId: string,
): Promise<AttachResult> {
  const attachments = await getPendingAssets(sourceMessageId);

  if (!attachments.length) {
    return {
      ok: false,
      message: "I lost track of those files — right-click the message and try again.",
    };
  }

  const tooBig = attachments.filter((a) => a.size > MAX_BYTES);
  const usable = attachments.filter((a) => a.size <= MAX_BYTES);

  if (!usable.length) {
    return {
      ok: false,
      message: `Every file is over ${Math.floor(MAX_BYTES / 1024 / 1024)}MB. Upload them to Drive and paste the link in the extras form instead.`,
    };
  }

  const files = await Promise.all(
    usable.map(async (a) => {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`Couldn't download ${a.filename} (${res.status})`);
      return { name: a.filename, data: await res.arrayBuffer() };
    }),
  );

  const channelId = config.channels.marketing();
  const posted = await postFiles(channelId, `**Assets — ${event.title}**`, files);

  const link = `https://discord.com/channels/${config.discord.guildId()}/${channelId}/${posted.id}`;
  await mergeDetails(event.event_id, { asset_files: link });

  const skipped = tooBig.length ? ` (${tooBig.length} file(s) too large, skipped)` : "";
  return {
    ok: true,
    message: `Attached ${files.length} file(s) to **${event.title}**${skipped}.`,
  };
}