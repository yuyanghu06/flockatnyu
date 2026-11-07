/** The detail fields, the two modals, the buttons, and the summary embed. */

import { config, mentionRoles } from "./config";
import {
  EPHEMERAL,
  TextInputStyle,
  editMessage,
  postMessage,
} from "./discord";
import { buildTimeline, prettyDate } from "./schedule";
import {
  Details,
  EventRow,
  getSummaryMessage,
  setSummaryMessage,
} from "./store";

export const FIELD_LABELS: Record<string, string> = {
  title: "Event title",
  when: "Date & time",
  location: "Location",
  description: "Description",
  food: "Food",
  assets: "Assets (link)",
  asset_files: "Uploaded files",
  collab: "Club collab",
  tagging: "Tag / collaborator",
  notes: "Notes",
};

export const REQUIRED = ["title", "when", "location", "description"];

function textInput(opts: {
  id: string;
  label: string;
  style?: number;
  value?: string;
  placeholder?: string;
  required?: boolean;
  max?: number;
}) {
  return {
    type: 1,
    components: [
      {
        type: 4,
        custom_id: opts.id,
        label: opts.label,
        style: opts.style ?? TextInputStyle.SHORT,
        value: opts.value || undefined,
        placeholder: opts.placeholder,
        required: opts.required ?? true,
        max_length: opts.max ?? 200,
      },
    ],
  };
}

/** A modal holds at most 5 inputs, hence two of them. */
export function coreModal(token: string, eventTitle: string, prefill: Details) {
  return {
    custom_id: `tnyu:core:${token}`,
    title: "Event details for marketing",
    components: [
      textInput({ id: "title", label: "Event title", value: prefill.title || eventTitle, max: 120 }),
      textInput({ id: "when", label: "Date & time", value: prefill.when, placeholder: "Thu Oct 22, 6:30-8:00 PM", max: 120 }),
      textInput({ id: "location", label: "Location", value: prefill.location, placeholder: "370 Jay St, Room 825" }),
      textInput({ id: "description", label: "Description (for the post)", style: TextInputStyle.PARAGRAPH, value: prefill.description, max: 1000 }),
      textInput({ id: "food", label: "Food?", value: prefill.food, placeholder: "Yes — pizza / No", required: false, max: 100 }),
    ],
  };
}

export function extrasModal(token: string, prefill: Details) {
  return {
    custom_id: `tnyu:extra:${token}`,
    title: "Optional extras",
    components: [
      textInput({ id: "assets", label: "Assets (Drive link, etc.)", value: prefill.assets, required: false, max: 300 }),
      textInput({ id: "collab", label: "Club collab", value: prefill.collab, placeholder: "e.g. Women in Computing", required: false }),
      textInput({ id: "tagging", label: "Tag or collaborator on the post?", value: prefill.tagging, placeholder: "@handle — tag / collaborator / neither", required: false }),
      textInput({ id: "notes", label: "Anything else marketing should know", style: TextInputStyle.PARAGRAPH, value: prefill.notes, required: false, max: 500 }),
    ],
  };
}

/** Dropdown of upcoming events. `which` decides what happens on pick:
 *  "core"/"extra" open a modal, "info" shows the details read-only.
 *  Discord allows 25 options max. */
export function eventSelect(
  which: "core" | "extra" | "info",
  events: { token: string; title: string; when: string }[],
) {
  return [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `tnyu:pick:${which}`,
          placeholder: "Pick an event…",
          options: events.slice(0, 25).map((e) => ({
            label: e.title.slice(0, 100),
            description: e.when.slice(0, 100),
            value: e.token,
          })),
        },
      ],
    },
  ];
}

export function detailButtons(token: string) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Fill in details", emoji: { name: "📝" }, custom_id: `tnyu:core:${token}` },
        { type: 2, style: 2, label: "Extras (assets, collab)", emoji: { name: "➕" }, custom_id: `tnyu:extra:${token}` },
      ],
    },
  ];
}

/** Pull the submitted values out of a modal interaction payload. */
export function readModal(data: any): Details {
  const out: Details = {};
  for (const row of data.components ?? []) {
    for (const input of row.components ?? []) {
      out[input.custom_id] = (input.value ?? "").trim();
    }
  }
  return out;
}

export function summaryEmbed(event: EventRow, details: Details) {
  const timeline = buildTimeline(event.event_date);
  const fields = Object.entries(FIELD_LABELS)
    .filter(([key]) => key !== "title" && details[key])
    .map(([key, label]) => ({ name: label, value: details[key].slice(0, 1024) }));

  const missing = REQUIRED.filter((k) => !details[k]);

  return {
    title: `📣 ${details.title || event.title}`,
    description: `Post deadline: **${prettyDate(timeline.postDeadline)}**`,
    color: 0x2ecc71,
    fields,
    footer: missing.length ? { text: `Still missing: ${missing.join(", ")}` } : undefined,
  };
}

/** Post the summary into the marketing channel, or edit it if it's already there. */
export async function publishSummary(event: EventRow, details: Details): Promise<void> {
  const embed = summaryEmbed(event, details);
  const existing = await getSummaryMessage(event.event_id);

  if (existing) {
    try {
      await editMessage(existing.channelId, existing.messageId, { embeds: [embed] });
      return;
    } catch {
      // Message was deleted — fall through and post a fresh one.
    }
  }

  const channelId = config.channels.marketing();
  const message = await postMessage(channelId, { embeds: [embed] });
  await setSummaryMessage(event.event_id, channelId, message.id);
}

export { EPHEMERAL, mentionRoles };