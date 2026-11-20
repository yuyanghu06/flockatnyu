// The two /event-details modals and how their submissions are read. A Discord
// modal holds at most five text inputs, so the fields are split into a core
// form and an optional extras form. Fields, labels and lengths follow the
// ported marketing bot.

export const DETAILS_PICK_ID = 'mkt:pick';
export const CORE_MODAL_ID = 'mkt:core';
export const EXTRA_MODAL_ID = 'mkt:extra';

const SHORT = 1;
const PARAGRAPH = 2;

const FORMS = Object.freeze({
  core: Object.freeze({
    customId: CORE_MODAL_ID,
    title: 'Event details for marketing',
    inputs: Object.freeze([
      { id: 'title', label: 'Event title', max: 120 },
      { id: 'when', label: 'Date & time', placeholder: 'Thu Oct 22, 6:30-8:00 PM', max: 120 },
      { id: 'location', label: 'Location', placeholder: '370 Jay St, Room 825', max: 200 },
      {
        id: 'description',
        label: 'Description (for the post)',
        style: PARAGRAPH,
        max: 1000,
      },
      { id: 'food', label: 'Food?', placeholder: 'Yes — pizza / No', required: false, max: 100 },
    ]),
  }),
  extra: Object.freeze({
    customId: EXTRA_MODAL_ID,
    title: 'Optional extras',
    inputs: Object.freeze([
      { id: 'assets', label: 'Assets (Drive link, etc.)', required: false, max: 300 },
      {
        id: 'collab',
        label: 'Club collab',
        placeholder: 'e.g. Women in Computing',
        required: false,
        max: 200,
      },
      {
        id: 'tagging',
        label: 'Tag or collaborator on the post?',
        placeholder: '@handle — tag / collaborator / neither',
        required: false,
        max: 200,
      },
      {
        id: 'notes',
        label: 'Anything else marketing should know',
        style: PARAGRAPH,
        required: false,
        max: 500,
      },
    ]),
  }),
});

export const FORM_KINDS = Object.freeze(Object.keys(FORMS));

// Builds the modal for `kind`, pre-filled with saved values. The title falls
// back to the Calendar title. Prefill is clipped to each input's maximum,
// because Discord rejects a modal whose value is longer than max_length.
// The custom ID carries this form's own saved version when it was opened (0
// when the form was never saved), so a save over a newer save of the same
// form is refused. Saves of the other form do not change it.
//
// A blank answer clears a saved optional field. That is only safe because the
// form always opens pre-filled: callers must never show this modal without the
// saved details (event-details.js answers "pick it again" instead).
export function detailsModal(kind, token, version, eventTitle, savedFields = {}) {
  const form = FORMS[kind];
  const saved = savedFields && typeof savedFields === 'object' ? savedFields : {};
  return {
    custom_id: `${form.customId}:${token}:${version}`,
    title: form.title,
    components: form.inputs.map((input) => {
      const prefill =
        typeof saved[input.id] === 'string' && saved[input.id].trim()
          ? saved[input.id]
          : input.id === 'title'
            ? eventTitle
            : '';
      return {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: input.id,
            label: input.label,
            style: input.style ?? SHORT,
            required: input.required ?? true,
            max_length: input.max,
            ...(input.placeholder ? { placeholder: input.placeholder } : {}),
            ...(prefill ? { value: String(prefill).slice(0, input.max) } : {}),
          },
        ],
      };
    }),
  };
}

// Reads a submitted modal. Only this form's own inputs are accepted; values
// are trimmed and over-long values make the submission invalid rather than
// being truncated. A blank optional input is returned in `clear` (the user
// deleted the pre-filled value); a blank required input is invalid. Inputs
// absent from the submission are left unchanged.
export function readDetailsModal(kind, data) {
  const form = FORMS[kind];
  const inputs = new Map(form.inputs.map((input) => [input.id, input]));
  const fields = {};
  const clear = [];
  for (const row of Array.isArray(data?.components) ? data.components : []) {
    for (const entry of Array.isArray(row?.components) ? row.components : []) {
      const input = inputs.get(entry?.custom_id);
      if (!input || typeof entry.value !== 'string') continue;
      if (Object.hasOwn(fields, input.id) || clear.includes(input.id)) return { valid: false };
      const value = entry.value.trim();
      if (value.length > input.max) return { valid: false };
      if (value) fields[input.id] = value;
      else if (input.required === false) clear.push(input.id);
      else return { valid: false };
    }
  }
  return { valid: true, fields, clear };
}

// Shows the answers a refused submission contained, in form order, so the
// person can copy them into the reopened form. Each answer is in a code block
// so links and Markdown characters copy exactly as typed.
export function answersEmbed(kind, read) {
  const form = FORMS[kind];
  const fields = form.inputs
    .filter((input) => Object.hasOwn(read.fields, input.id) || read.clear.includes(input.id))
    .map((input) => {
      const value = read.fields[input.id];
      return {
        name: input.label,
        value: value
          ? `\`\`\`\n${value.replaceAll('```', '`\u200b``').slice(0, 1016)}\n\`\`\``
          : '(left blank)',
      };
    });
  return { title: 'Your answers (not saved)', color: 0xe67e22, fields };
}
