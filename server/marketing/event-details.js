// /event-details: pick an upcoming Calendar event, fill in the core or extras
// modal, and save. Saving merges the submitted fields over the saved ones
// atomically in the database (blank optional fields clear their saved value),
// refuses a form opened before someone else's save, and replies with an
// ephemeral confirmation.
// It never writes Calendar, posts in a channel or schedules reminders.
import { EPHEMERAL, InteractionCallback, NO_MENTIONS } from '../discord/interactions.js';
import { denyUnlessAuthorized, loadEventChoices } from './event-info.js';
import { detailsEmbed, pickerMessage } from './views.js';
import {
  CORE_MODAL_ID,
  DETAILS_PICK_ID,
  EXTRA_MODAL_ID,
  FORM_KINDS,
  answersEmbed,
  detailsModal,
  readDetailsModal,
} from './details-form.js';

const TOKEN = /^[0-9a-f]{16}$/;
const SNOWFLAKE = /^[0-9]{1,20}$/;
const FORM_TARGET = /^([0-9a-f]{16}):(0|[1-9][0-9]{0,8})$/;
// A modal must be the direct response to the pick, so the prefill read cannot
// be deferred. Leave headroom inside Discord's three-second window.
export const PREFILL_TIMEOUT_MS = 2000;

const ephemeral = (content) => ({
  type: InteractionCallback.CHANNEL_MESSAGE,
  data: { content, flags: EPHEMERAL, allowed_mentions: NO_MENTIONS },
});
const LOST = 'I lost track of that event. Run /event-details again.';

function wantsExtras(interaction) {
  const options = Array.isArray(interaction.data?.options) ? interaction.data.options : [];
  return options.some((option) => option?.name === 'extras' && option.value === true);
}

// Parses "<prefix>:<suffix>" custom IDs such as "mkt:pick:core" or "mkt:core:<token>:<version>".
function suffixOf(customId, prefix) {
  return typeof customId === 'string' && customId.startsWith(`${prefix}:`)
    ? customId.slice(prefix.length + 1)
    : '';
}

const LABELS = Object.freeze({
  food: 'food',
  assets: 'assets',
  collab: 'collab',
  tagging: 'tagging',
  notes: 'notes',
});

function confirmation(kind, event, details, cleared) {
  const lines = [`Saved the marketing details for **${event.title}** (${event.date}).`];
  if (cleared.length) lines.push(`Cleared: ${cleared.map((key) => LABELS[key]).join(', ')}.`);
  if (kind === 'core')
    lines.push('Run `/event-details extras:True` to add assets, a collab, tagging or notes.');
  return {
    content: lines.join('\n'),
    embeds: [detailsEmbed(event, details)],
    components: [],
  };
}

export function createEventDetailsHandlers({ config, calendar, store, now = () => new Date() }) {
  async function command({ interaction, responder }) {
    if (await denyUnlessAuthorized({ interaction, responder, config })) return;
    await responder.callback(interaction, {
      type: InteractionCallback.DEFERRED_CHANNEL_MESSAGE,
      data: { flags: EPHEMERAL },
    });
    const kind = wantsExtras(interaction) ? 'extra' : 'core';
    try {
      const loaded = await loadEventChoices({ calendar, store, now: now() });
      await responder.editOriginal(
        interaction,
        loaded.message
          ? { content: loaded.message }
          : pickerMessage({
              ...loaded,
              customId: `${DETAILS_PICK_ID}:${kind}`,
              prompt:
                kind === 'core'
                  ? 'Which event are you filling in?'
                  : 'Which event are you adding extras to?',
            }),
      );
    } catch {
      await responder
        .editOriginal(interaction, { content: 'Something went wrong. Try /event-details again.' })
        .catch(() => {});
    }
  }

  // Responds to the pick with the modal itself, pre-filled with saved details.
  // The form must never open without them: blanks clear saved fields, so an
  // empty form after a failed read would erase real data on submit. A slow or
  // failed read therefore answers "pick it again" instead.
  async function select({ interaction, responder }) {
    if (await denyUnlessAuthorized({ interaction, responder, config })) return;
    const kind = suffixOf(interaction.data?.custom_id, DETAILS_PICK_ID);
    const token = interaction.data?.values?.[0];
    if (!FORM_KINDS.includes(kind) || !TOKEN.test(token ?? '')) {
      await responder.callback(interaction, ephemeral(LOST));
      return;
    }
    let found;
    try {
      found = await store.lookup({ token, signal: AbortSignal.timeout(PREFILL_TIMEOUT_MS) });
    } catch {
      found = { status: 'unavailable' };
    }
    if (found.status === 'not_found' || found.status === 'invalid_request') {
      await responder.callback(interaction, ephemeral(LOST));
      return;
    }
    if (found.status !== 'ready') {
      await responder.callback(
        interaction,
        ephemeral("I couldn't load that event's saved details in time. Pick it again."),
      );
      return;
    }
    await responder.callback(interaction, {
      type: InteractionCallback.MODAL,
      data: detailsModal(
        kind,
        token,
        found.details?.versions?.[kind] ?? 0,
        found.event.title,
        found.details?.fields,
      ),
    });
  }

  function modalFor(kind, prefix) {
    return async function modal({ interaction, responder }) {
      if (await denyUnlessAuthorized({ interaction, responder, config })) return;
      await responder.callback(interaction, {
        type: InteractionCallback.DEFERRED_CHANNEL_MESSAGE,
        data: { flags: EPHEMERAL },
      });
      const reply = (content) => responder.editOriginal(interaction, { content });
      try {
        const target = FORM_TARGET.exec(suffixOf(interaction.data?.custom_id, prefix));
        const updatedBy = interaction.member?.user?.id;
        const read = readDetailsModal(kind, interaction.data);
        if (!target || !SNOWFLAKE.test(updatedBy ?? '') || !read.valid) {
          await reply("I couldn't read that form. Run /event-details again.");
          return;
        }
        if (!Object.keys(read.fields).length && !read.clear.length) {
          await reply('Nothing to save: the form was empty. Saved details are unchanged.');
          return;
        }
        const saved = await store.merge({
          token: target[1],
          form: kind,
          expectedVersion: Number(target[2]),
          fields: read.fields,
          clear: read.clear,
          updatedBy,
        });
        if (saved.status === 'ready' && !saved.details)
          return await reply('Nothing to save: the form was empty and nothing was saved before.');
        if (saved.status === 'ready') {
          await responder.editOriginal(
            interaction,
            confirmation(
              kind,
              saved.event,
              saved.details,
              (Array.isArray(saved.cleared) ? saved.cleared : []).filter((key) =>
                Object.hasOwn(LABELS, key),
              ),
            ),
          );
          return;
        }
        if (saved.status === 'not_found') return await reply(LOST);
        if (saved.status === 'conflict') {
          // Only a save of this same form makes it stale.
          await responder.editOriginal(interaction, {
            content:
              'Someone else saved this form for the event after you opened it, so nothing was saved. Run /event-details again to see their version; your answers are below to copy in.',
            embeds: [answersEmbed(kind, read)],
          });
          return;
        }
        if (saved.status === 'too_large')
          return await reply('Those details are too long to save. Shorten some fields and retry.');
        // A lost response or timeout may follow a committed write.
        if (saved.status === 'unavailable' || saved.status === 'aborted')
          return await reply(
            "I couldn't confirm the save. Check with /event-info before submitting again.",
          );
        await reply("I couldn't save the details right now, so nothing was saved. Try again.");
      } catch {
        await reply(
          'Something went wrong, so the details may not have been saved. Check with /event-info.',
        ).catch(() => {});
      }
    };
  }

  return Object.freeze({
    command,
    select,
    core: modalFor('core', CORE_MODAL_ID),
    extra: modalFor('extra', EXTRA_MODAL_ID),
  });
}
