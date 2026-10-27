import { promptText } from '../../prompt-loader/index.js';
const define = (name, description, properties, required = []) =>
  Object.freeze({
    name,
    description,
    readOnly: true,
    parameters: { type: 'object', additionalProperties: false, properties, required },
  });
const queryStrings = {
  q: 1000,
  company_domain: 253,
  title: 200,
  full_name: 400,
  country: 100,
  location: 300,
};
export const TREG_TOOLS = Object.freeze([
  define('search_treg_people', promptText('tools/treg/search_treg_people#description'), {
    ...Object.fromEntries(
      Object.entries(queryStrings).map(([key, maxLength]) => [
        key,
        { type: 'string', minLength: 1, maxLength },
      ]),
    ),
    keywords: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 100 },
    },
    limit: { type: 'integer', minimum: 1, maximum: 10 },
  }),
  define(
    'enrich_treg_people',
    promptText('tools/treg/enrich_treg_people#description'),
    {
      emails: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: { type: 'string', minLength: 3, maxLength: 320 },
      },
    },
    ['emails'],
  ),
]);
