/** The interactions endpoint. This URL goes in the Developer Portal.
 *
 * Replaces the gateway connection: instead of your process holding a socket
 * open, Discord POSTs here each time someone clicks or submits something.
 */

import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";

import { attachToEvent } from "@/lib/assets";
import {
  EPHEMERAL,
  coreModal,
  eventSelect,
  extrasModal,
  publishSummary,
  readModal,
  summaryEmbed,
} from "@/lib/details";
import {
  InteractionResponseType,
  InteractionType,
  editInteractionResponse,
  verifySignature,
} from "@/lib/discord";
import {
  LEADERSHIP_DETAILS,
  MARKETING_WARNING,
  buildTimeline,
  prettyDate,
  todayLocal,
} from "@/lib/schedule";
import { sweep } from "@/lib/sweep";
import {
  clearSent,
  ensureSchema,
  eventForToken,
  getDetails,
  mergeDetails,
  registerEvent,
  savePendingAssets,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown) {
  return NextResponse.json(body);
}

function reply(content: string) {
  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  });
}

export async function POST(request: Request) {
  // Raw body, before any parsing — the signature is over these exact bytes.
  const raw = await request.text();
  const ok = verifySignature(
    raw,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
  );
  if (!ok) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(raw);

  if (interaction.type === InteractionType.PING) {
    return json({ type: InteractionResponseType.PONG });
  }

  await ensureSchema();

  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleButton(interaction);
  }
  if (interaction.type === InteractionType.MODAL_SUBMIT) {
    return handleModal(interaction);
  }
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction);
  }

  return json({ type: InteractionResponseType.PONG });
}

async function handleButton(interaction: any) {
  const parts = String(interaction.data.custom_id).split(":");
  const selected = interaction.data.values?.[0];

  // Three shapes:
  //   tnyu:core:<token>              a button on the reminder message
  //   tnyu:pick:<which>              event dropdown, token is the selection
  //   tnyu:attach:<msg>              event dropdown for a file attachment
  let which: string;
  let token: string | undefined;
  let source: { messageId: string } | undefined;

  if (parts[1] === "pick") {
    which = parts[2];
    token = selected;
  } else if (parts[1] === "attach") {
    which = "attach";
    token = selected;
    source = { messageId: parts[2] };
  } else {
    which = parts[1];
    token = parts[2];
  }

  const lost = "I've lost track of that event — it may have been removed from the calendar.";
  if (!token) return reply(lost);

  const event = await eventForToken(token);
  if (!event) return reply(lost);

  // Downloading and re-uploading takes longer than 3s, so defer.
  if (which === "attach" && source) {
    waitUntil(
      attachToEvent(event, source.messageId)
        .then(async (result) => {
          await editInteractionResponse(interaction.token, { content: result.message });
          if (result.ok) {
            await publishSummary(event, await getDetails(event.event_id));
          }
        })
        .catch(async (err) => {
          await editInteractionResponse(interaction.token, {
            content: `Couldn't attach that: ${String(err)}`.slice(0, 1900),
          });
        }),
    );
    return json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: EPHEMERAL },
    });
  }

  const prefill = await getDetails(event.event_id);

  // The info picker just shows what's there — no form.
  if (which === "info") {
    if (!Object.keys(prefill).length) {
      return reply(
        `**${event.title}** — leadership hasn't submitted any details yet.`,
      );
    }
    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { embeds: [summaryEmbed(event, prefill)], flags: EPHEMERAL },
    });
  }

  return json({
    type: InteractionResponseType.MODAL,
    data: which === "core" ? coreModal(token, event.title, prefill) : extrasModal(token, prefill),
  });
}

async function handleModal(interaction: any) {
  const [, , token] = String(interaction.data.custom_id).split(":");
  const event = await eventForToken(token);
  if (!event) return reply("Unknown event.");

  const merged = await mergeDetails(event.event_id, readModal(interaction.data));

  // Post the summary after responding, so Discord gets its answer inside 3s.
  waitUntil(publishSummary(event, merged));

  return reply("Saved — marketing has it.");
}

async function handleCommand(interaction: any) {
  const name = interaction.data.name as string;

  // Message context menu: "Attach to event" on a message with files.
  if (interaction.data.type === 3) {
    waitUntil(offerAttachTargets(interaction));
    return json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: EPHEMERAL },
    });
  }

  const options: Record<string, any> = Object.fromEntries(
    (interaction.data.options ?? []).map((o: any) => [o.name, o.value]),
  );

  if (name === "reset-reminders") {
    const removed = await clearSent();
    return reply(`Cleared ${removed} record(s). Every reminder can fire again.`);
  }

  // The calendar call can take longer than Discord's 3s limit, so defer and
  // fill in the real answer afterwards.
  waitUntil(runDeferred(name, options, interaction.token));
  return json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: EPHEMERAL },
  });
}

async function offerAttachTargets(interaction: any) {
  const messageId = interaction.data.target_id as string;
  const message = interaction.data.resolved?.messages?.[messageId];

  if (!message?.attachments?.length) {
    await editInteractionResponse(interaction.token, {
      content: "That message has no files attached.",
    });
    return;
  }

  // Hold the file list; the REST fetch after the pick isn't dependable.
  await savePendingAssets(
    messageId,
    message.attachments.map((a: any) => ({
      filename: a.filename,
      url: a.url,
      size: a.size,
    })),
  );

  const { upcoming: fetchUpcoming } = await import("@/lib/calendar");
  const events = await fetchUpcoming(todayLocal());
  if (!events.length) {
    await editInteractionResponse(interaction.token, { content: "Nothing on the calendar." });
    return;
  }

  const choices = [];
  for (const event of events.slice(0, 25)) {
    choices.push({
      token: await registerEvent(event.id, event.title, event.date),
      title: event.title,
      when: event.when,
    });
  }

  const menu = eventSelect("core", choices);
  (menu[0].components[0] as any).custom_id = `tnyu:attach:${messageId}`;

  await editInteractionResponse(interaction.token, {
    content: `Attach ${message.attachments.length} file(s) to which event?`,
    components: menu,
  });
}

async function runDeferred(name: string, options: Record<string, any>, token: string) {
  try {
    if (name === "check-reminders") {
      const today = options.as_of || todayLocal();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        await editInteractionResponse(token, { content: "`as_of` must look like 2026-10-22." });
        return;
      }
      const result = await sweep({ today, dryRun: Boolean(options.dry_run) });
      const verb = options.dry_run ? "would send" : "sent";
      const detail = result.lines.length ? `\n${result.lines.join("\n")}` : "";
      await editInteractionResponse(token, {
        content: `Sweep finished — ${verb} ${result.sent} reminder(s).${detail}`.slice(0, 1900),
      });
      return;
    }

    if (name === "event-details" || name === "event-info") {
      const info = name === "event-info";
      const { upcoming: fetchUpcoming } = await import("@/lib/calendar");
      const events = await fetchUpcoming(todayLocal());
      if (!events.length) {
        await editInteractionResponse(token, { content: "Nothing on the calendar." });
        return;
      }
      // Every event needs a row before its token can resolve in the modal.
      const choices = [];
      for (const event of events.slice(0, 25)) {
        choices.push({
          token: await registerEvent(event.id, event.title, event.date),
          title: event.title,
          when: event.when,
        });
      }
      const which = info ? "info" : options.extras ? "extra" : "core";
      await editInteractionResponse(token, {
        content: info
          ? "Which event do you want the details for?"
          : which === "core"
            ? "Which event are you filling in?"
            : "Which event are you adding extras to?",
        components: eventSelect(which, choices),
      });
      return;
    }

    if (name === "upcoming") {
      const { upcoming: fetchUpcoming } = await import("@/lib/calendar");
      const today = todayLocal();
      const events = await fetchUpcoming(today);
      if (!events.length) {
        await editInteractionResponse(token, { content: "Nothing on the calendar." });
        return;
      }
      const lines = events.slice(0, 15).map((e) => {
        const t = buildTimeline(e.date);
        return (
          `**${e.title}** — ${e.when}\n` +
          `• ask leadership ${prettyDate(t.due[LEADERSHIP_DETAILS])}` +
          ` · warn marketing ${prettyDate(t.due[MARKETING_WARNING])}` +
          ` · post ${prettyDate(t.postDeadline)}`
        );
      });
      await editInteractionResponse(token, { content: lines.join("\n").slice(0, 1900) });
    }
  } catch (err) {
    await editInteractionResponse(token, { content: `Something broke: ${String(err)}`.slice(0, 1900) });
  }
}