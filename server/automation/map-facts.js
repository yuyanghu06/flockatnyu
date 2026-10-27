import { canonicalJson } from './validation.js';

const eventFields = [
  'name',
  'notes',
  'kind',
  'type_id',
  'status',
  'time_kind',
  'starts_at',
  'ends_at',
  'starts_on',
  'ends_on',
  'time_zone',
  'source_id',
  'source_url',
  'source_record_id',
  'url',
  'reported_at',
];
const buildingsOf = (rows = []) =>
  rows
    .map((row) => ({
      building_id: row.building_id,
      location_notes: row.location_notes ?? '',
    }))
    .sort((left, right) => left.building_id.localeCompare(right.building_id));

// A building move changes the event's facts just as a changed time/name does.
// Reordering equivalent relations or changing null to the empty default does not.
export function mapFactsChanged({ current, previousBuildings, event, buildings }) {
  return (
    !current ||
    eventFields.some(
      (key) => canonicalJson(current[key] ?? null) !== canonicalJson(event[key] ?? null),
    ) ||
    canonicalJson(buildingsOf(previousBuildings?.filter((row) => row.event_id === current.id))) !==
      canonicalJson(buildingsOf(buildings))
  );
}
