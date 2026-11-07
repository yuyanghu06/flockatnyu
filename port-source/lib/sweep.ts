/** The daily sweep: find what's due, send it. Port of ReminderBot.sweep. */

import { CalEvent, upcoming } from "./calendar";
import { config, mentionRoles } from "./config";
import { REQUIRED, detailButtons } from "./details";
import { postMessage } from "./discord";
import {
  Kind,
  LEADERSHIP_DETAILS,
  MARKETING_RELEASE,
  MARKETING_WARNING,
  buildTimeline,
  daysUntil,
  dueKinds,
  prettyDate,
} from "./schedule";
import { alreadySent, getDetails, markSent, registerEvent } from "./store";

export interface SweepResult {
  sent: number;
  lines: string[];
}

export async function sweep(opts: { today: string; dryRun?: boolean }): Promise<SweepResult> {
  const events = await upcoming(opts.today);
  const lines: string[] = [];
  let sent = 0;

  for (const event of events) {
    for (const kind of dueKinds(event.date, opts.today)) {
      if (await alreadySent(event.id, kind)) continue;
      if (opts.dryRun) {
        lines.push(`would send ${kind} — ${event.title}`);
        sent += 1;
        continue;
      }
      try {
        await send(kind, event, opts.today);
      } catch (err) {
        lines.push(`FAILED ${kind} — ${event.title}: ${String(err)}`);
        continue;
      }
      await markSent(event.id, kind);
      lines.push(`sent ${kind} — ${event.title}`);
      sent += 1;
    }
  }

  return { sent, lines };
}

async function send(kind: Kind, event: CalEvent, today: string): Promise<void> {
  const timeline = buildTimeline(event.date);
  const deadline = timeline.postDeadline;
  const token = await registerEvent(event.id, event.title, event.date);

  if (kind === LEADERSHIP_DETAILS) {
    await postMessage(config.channels.leadership(), {
      content: mentionRoles("leadership", "events"),
      embeds: [
        {
          title: `Marketing needs details: ${event.title}`,
          description:
            `**Event:** ${event.when}\n` +
            `**Post deadline:** ${prettyDate(deadline)} (${daysUntil(deadline, today)})\n\n` +
            "Hit the button and fill in what marketing needs. " +
            "Anything already on the calendar is pre-filled.",
          color: 0x5865f2,
          fields: [
            { name: "Needed", value: "Title · date & time · location · description · food" },
            { name: "Optional", value: "Assets · club collab · tag or collaborator" },
          ],
        },
      ],
      components: detailButtons(token),
    });
    return;
  }

  if (kind === MARKETING_WARNING) {
    const details = await getDetails(event.id);
    const missing = REQUIRED.filter((k) => !details[k]);
    const note = missing.length
      ? `⚠️ Leadership hasn't sent: ${missing.join(", ")}`
      : "✅ Details are in — see the summary in this channel.";
    await postMessage(config.channels.marketing(), {
      content: mentionRoles("marketing"),
      embeds: [
        {
          title: `Post due in ${config.schedule.marketingWarningDays} days: ${event.title}`,
          description: `**Post deadline:** ${prettyDate(deadline)}\n**Event:** ${event.when}\n\n${note}`,
          color: 0xf1c40f,
        },
      ],
    });
    return;
  }

  if (kind === MARKETING_RELEASE) {
    await postMessage(config.channels.marketing(), {
      content: mentionRoles("marketing"),
      embeds: [
        {
          title: `Post goes out today: ${event.title}`,
          description: `**Event:** ${event.when} (${daysUntil(event.date, today)})`,
          color: 0xe74c3c,
        },
      ],
    });
  }
}
