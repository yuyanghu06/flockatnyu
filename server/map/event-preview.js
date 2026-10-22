import {eventWindow} from './events.js';

// Exact, expiring UI fixture identity. This grants local display only; shared
// event reads/writes still require their ordinary provider authorization.
export const GO_GREEK_EVENT_PREVIEW = Object.freeze({
  sourceId:'793e578c-b825-46df-a52f-ad762e0412dd',
  eventId:'63ebd0ce-1100-4d9b-bdfc-1d9d5d92c55f',
  sourceUrl:'https://example.invalid/tech-nyu/map-debug/go-greek-active-event-v1',
  sourceRecordId:'go-greek-active-event-preview-v1',
  name:'[UI TEST] Go Greek sample event',
  buildingId:'683-broadway',
  kind:'scheduled_event',
  typeId:'event',
  status:'confirmed',
  timeKind:'timed',
  maxDurationMs:7200000,
});

export function isGoGreekPreviewProvenance(row) {
  return row?.source_id?.toLowerCase?.()===GO_GREEK_EVENT_PREVIEW.sourceId ||
    row?.source_url===GO_GREEK_EVENT_PREVIEW.sourceUrl;
}

export function authorizeGoGreekEventPreview({production,principal,row,event,building,person=null}={}) {
  const fixture=GO_GREEK_EVENT_PREVIEW;
  if(production!==false || principal?.id!=='local-development' || !event || row!==event || person!==null ||
    building?.id!==fixture.buildingId || event.id!==fixture.eventId ||
    event.source_id!==fixture.sourceId || event.source_url!==fixture.sourceUrl ||
    event.source_record_id!==fixture.sourceRecordId || event.name!==fixture.name ||
    event.kind!==fixture.kind || event.type_id!==fixture.typeId || event.status!==fixture.status ||
    event.time_kind!==fixture.timeKind)return false;
  const window=eventWindow(event);
  return Boolean(window && !window.unknown && !window.allDay && Number.isFinite(window.start) &&
    Number.isFinite(window.end) && window.end>window.start && window.end-window.start<=fixture.maxDurationMs+1);
}
