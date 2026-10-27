import { uuid } from '../../map/events.js';

import { projectTregFields, projectTregUsage } from '../../treg/operations/projections.js';

export function projectTregResult({ data, name, args, result }) {
  if (['search_treg_people', 'enrich_treg_people'].includes(name)) {
    // Only this bounded projection enters model context. Tool execution events
    // and operational audit retain names/statuses/counts, never these values.
    data.arguments = {};
    data.sources = [];
    if (name === 'search_treg_people' && result?.status === 'ready') {
      if (
        Array.isArray(result.people) &&
        result.people.length <= (args?.limit ?? 5) &&
        result.people.every(
          (person) =>
            person?.fields && typeof person.fields === 'object' && !Array.isArray(person.fields),
        ) &&
        projectTregUsage(result.usage)
      ) {
        data.people = result.people.map((person) => ({
          fields: projectTregFields(person.fields),
          ...(uuid(person.resultId) ? { resultId: person.resultId } : {}),
        }));
        data.usage = projectTregUsage(result.usage);
      } else data.status = 'invalid_response';
    }
    if (name === 'enrich_treg_people' && Array.isArray(result?.results)) {
      const statuses = new Set([
        'ready',
        'forbidden',
        'invalid_request',
        'not_configured',
        'aborted',
        'rate_limited',
        'budget_exceeded',
        'response_too_large',
        'invalid_response',
        'log_unavailable',
        'unavailable',
      ]);
      if (
        result.results.length === args?.emails?.length &&
        result.results.length <= 10 &&
        result.results.every(
          (item, index) =>
            item?.email === args.emails[index] &&
            statuses.has(item.status) &&
            (item.status !== 'ready' ||
              (typeof item.matched === 'boolean' &&
                item.fields &&
                typeof item.fields === 'object' &&
                !Array.isArray(item.fields) &&
                projectTregUsage(item.usage))),
        )
      ) {
        data.results = result.results.map((item) => ({
          email: item.email,
          status: item.status,
          ...(item.status === 'ready'
            ? {
                matched: item.matched,
                fields: item.matched ? projectTregFields(item.fields) : {},
                usage: projectTregUsage(item.usage),
                ...(item.matched && uuid(item.resultId) ? { resultId: item.resultId } : {}),
              }
            : {}),
        }));
      } else data.status = 'invalid_response';
    }
    if (Buffer.byteLength(JSON.stringify(data)) > 62000) {
      delete data.people;
      delete data.results;
      delete data.usage;
      data.status = 'response_too_large';
      data.complete = false;
    }
  }
}
