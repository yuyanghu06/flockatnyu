// Guild slash-command definitions for the marketing interactions. Registered
// one at a time by scripts/register-marketing-commands.mjs; the bulk-replace
// endpoint is never used, so other commands on the application are untouched.
export const MARKETING_COMMANDS = Object.freeze({
  'event-info': Object.freeze({
    name: 'event-info',
    type: 1,
    description: 'Look up the marketing details submitted for an upcoming event',
    contexts: Object.freeze([0]),
  }),
  'event-details': Object.freeze({
    name: 'event-details',
    type: 1,
    description: 'Fill in marketing details for an upcoming event',
    contexts: Object.freeze([0]),
    options: Object.freeze([
      Object.freeze({
        type: 5,
        name: 'extras',
        description: 'Open the extras form (assets, collab, tagging, notes) instead',
        required: false,
      }),
    ]),
  }),
});
