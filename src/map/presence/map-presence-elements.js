import { createPresenceLayout } from './map-presence-layout.js';

export function initializeMapPresence(view) {
  view.layer = document.createElement('div');
  view.layer.className = 'map-presence';
  view.layer.setAttribute('aria-label', 'People on the campus map');
  view.container.append(view.layer);
  view.itinerary = document.createElement('aside');
  view.itinerary.className = 'map-presence__itinerary';
  view.itinerary.setAttribute('aria-label', 'Person schedule');
  view.itinerary.hidden = true;
  view.itinerary.addEventListener('pointerdown', (event) => event.stopPropagation());
  view.itinerary.addEventListener('dblclick', (event) => event.stopPropagation());
  view.layer.append(view.itinerary);
  view.buildingCard = document.createElement('aside');
  view.buildingCard.className = 'map-presence__itinerary map-presence__building-card';
  view.buildingCard.setAttribute('aria-label', 'Building activity');
  view.buildingCard.hidden = true;
  view.buildingCard.addEventListener('pointerdown', (event) => event.stopPropagation());
  view.buildingCard.addEventListener('dblclick', (event) => event.stopPropagation());
  view.layer.append(view.buildingCard);
  view.groups = [];
  view.source = [];
  view.disposed = false;
  view.pending = null;
  view.catalogue = [];
  view.buildingCardKey = null;
  view.buildingCardId = null;
  view.status = 'loading';
  view.observedAt = null;
  view.requestController = null;
  view.refreshQueued = false;
  view.retryTimer = null;
  view.retryAttempt = 0;
  view.layout = createPresenceLayout(view.renderer, view.camera);
  view.previousFrame = performance.now();
  view.listeners = new AbortController();
  view.revealed = new Set();
  view.focusSessionId = null;
  view.focusSeed = 0;
  view.focusedPersonId = null;
  view.drag = null;
  view.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  view.upcoming = [];
  view.upcomingAvailable = false;
  view.itineraryKey = null;
  view.itineraryPersonKey = null;
  view.markerKey = '';
  view.contentKey = '';
  view.contentRevision = 0;
  view.contentTimes = [];
  view.nextContentBoundary = 0;
  view.previousWallTime = 0;
  view.nextMarkerExpiry = Infinity;
  view.planDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  view.eventDateTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  view.planClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  view.planDateOnly = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  view.planDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'short',
  });
  view.planEnd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
  view.midnightParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  });
}
