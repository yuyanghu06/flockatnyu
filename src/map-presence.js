import { createPresenceLayout } from './map-presence-layout.js';
import { clampFocusedAvatarPosition } from './map-presence-drag.js';
import { buildings as campusBuildings } from './config.js';
import './map-presence.css';

// Vite includes every approved portrait in production, without trusting source URLs.
const portraitImports = import.meta.glob('../assets/avatars/*.png', { eager: true, query: '?url', import: 'default' });
const portraits = new Map(Object.entries(portraitImports).map(([path, url]) => [path.split('/').at(-1), url]));
const buildingPortraitImports = import.meta.glob('../assets/building-portraits/*-v1.webp', { eager: true, query: '?url', import: 'default' });
const buildingPortraits = new Map(Object.entries(buildingPortraitImports).map(([path, url]) => [path.split('/').at(-1).replace(/-v1\.webp$/, ''), url]));
function eventRoom(value, buildingName) {
  if (typeof value !== 'string') return '';
  const location = value.trim();
  const parts = /^(.+?)\s*[·—–]\s*(.*)$/u.exec(location) ?? /^(.+?),\s*(.*)$/u.exec(location);
  const prefix = (parts?.[1] ?? location).trim().toLocaleLowerCase();
  const name = buildingName.trim().toLocaleLowerCase();
  if (prefix.length >= 3 && (name === prefix || name.startsWith(`${prefix} `))) return (parts?.[2] ?? '').trim();
  return location;
}
function portraitUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/assets/avatars/')) return null;
  try { return portraits.get(decodeURIComponent(value.slice('/assets/avatars/'.length))) ?? null; }
  catch { return null; }
}
function initials(name) {
  return name.trim().split(/\s+/u).map(part => [...part][0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function active(person, now = Date.now()) {
  return person.starts <= now && now < person.ends;
}
function parsePresence(payload) {
  if (payload?.status !== 'ok' || !Array.isArray(payload.buildings) || payload.buildings.length > 100) throw new Error('Invalid map presence');
  const seen = new Set();
  const buildingIds = new Set();
  return payload.buildings.map(building => {
    if (typeof building?.id !== 'string' || typeof building.name !== 'string' || !Array.isArray(building.people) || building.people.length > 1000) throw new Error('Invalid building presence');
    if (buildingIds.has(building.id)) throw new Error('Duplicate building');
    buildingIds.add(building.id);
    const people = building.people.map(person => {
      const starts = Date.parse(person?.validFrom), ends = Date.parse(person?.expiresAt);
      const key = `${building.id}:${person?.id}`;
      if (typeof person?.id !== 'string' || !person.id || typeof person.displayName !== 'string' || !person.displayName.trim() ||
          typeof person.label !== 'string' || [...person.label].length > 200 ||
          !['planned', 'self_reported'].includes(person.status) || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || seen.has(key)) throw new Error('Invalid person presence');
      seen.add(key);
      return { ...person, starts, ends };
    }).filter(person => active(person));
    const events = building.events ?? [];
    if (!Array.isArray(events) || events.length > 2000) throw new Error('Invalid building events');
    const parsedEvents = events.map(event => {
      const starts = Date.parse(event?.startsAt), ends = Date.parse(event?.endsAt);
      if (typeof event?.id !== 'string' || typeof event.title !== 'string' || !event.title.trim() ||
          !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || typeof event.allDay !== 'boolean' ||
          !['confirmed','tentative'].includes(event.status) || typeof event.timeZone !== 'string') throw new Error('Invalid building event');
      const attendees = event.attendees ?? [];
      if (!Array.isArray(attendees) || attendees.length > 500 || attendees.some(person=>
        typeof person?.id !== 'string' || typeof person.displayName !== 'string' || !person.displayName.trim())) throw new Error('Invalid event attendees');
      return {...event, starts, ends, attendees};
    }).sort((a,b)=>a.starts-b.starts);
    return { id: building.id, name: building.name, people, events: parsedEvents };
  });
}

function parseUpcoming(value) {
  if (!Array.isArray(value) || value.length > 50000) throw new Error('Invalid upcoming plans');
  return value.map(plan => {
    const starts = Date.parse(plan?.validFrom), ends = Date.parse(plan?.expiresAt);
    if (typeof plan?.personId !== 'string' || typeof plan.buildingId !== 'string' || typeof plan.buildingName !== 'string' ||
        typeof plan.label !== 'string' || [...plan.label].length > 200 || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) throw new Error('Invalid upcoming plan');
    return { ...plan, starts, ends };
  }).sort((a,b)=>a.starts-b.starts);
}

// Compare only normalized data used by this view. Freshness receipts and object
// property order do not change portraits or justify discarding a live drag.
function markerSignature(buildings) {
  return JSON.stringify(buildings.map(building => [building.id, building.name,
    building.people.map(person => [person.id, person.displayName, person.avatarUrl ?? null,
      person.status, person.label, person.starts, person.ends]).sort((a,b) => a[0].localeCompare(b[0])),
  ]).sort((a,b) => a[0].localeCompare(b[0])));
}
function contentSignature(buildings, plans) {
  return JSON.stringify([markerSignature(buildings), buildings.map(building => [building.id, building.name,
    building.events.map(event => [event.id, event.title, event.starts, event.ends, event.allDay,
      event.status, event.timeZone, event.location ?? '', event.url ?? null,
      event.attendees.map(person => [person.id, person.displayName, person.avatarUrl ?? null]),
    ]),
  ]), plans.map(plan => [plan.personId, plan.buildingId, plan.buildingName, plan.label, plan.starts, plan.ends])]);
}

export function createMapPresence({ container, camera, renderer, getRoot, selectBuilding, focusBuilding, getFocusedBuilding = () => null, fetchImpl = fetch }) {
  const layer = document.createElement('div');
  layer.className = 'map-presence';
  layer.setAttribute('aria-label', 'People on the campus map');
  container.append(layer);
  const itinerary = document.createElement('aside');
  itinerary.className = 'map-presence__itinerary';
  itinerary.setAttribute('aria-label', 'Person schedule');
  itinerary.hidden = true;
  itinerary.addEventListener('pointerdown', event => event.stopPropagation());
  itinerary.addEventListener('dblclick', event => event.stopPropagation());
  layer.append(itinerary);
  const buildingCard = document.createElement('aside');
  buildingCard.className = 'map-presence__itinerary map-presence__building-card';
  buildingCard.setAttribute('aria-label', 'Building activity');
  buildingCard.hidden = true;
  buildingCard.addEventListener('pointerdown', event => event.stopPropagation());
  buildingCard.addEventListener('dblclick', event => event.stopPropagation());
  layer.append(buildingCard);
  let groups = [], source = [], disposed = false, pending = null;
  let catalogue = [], buildingCardKey = null, buildingCardId = null;
  let status = 'loading', observedAt = null, requestController = null;
  const layout = createPresenceLayout(renderer, camera);
  let previousFrame = performance.now();
  const listeners = new AbortController();
  const revealed = new Set();
  let focusSessionId = null, focusSeed = 0, focusedPersonId = null;
  let drag = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let upcoming = [], upcomingAvailable = false, itineraryKey = null, itineraryPersonKey = null;
  let markerKey = '', contentKey = '', contentRevision = 0;
  let contentTimes = [], nextContentBoundary = 0, previousWallTime = 0;
  let nextMarkerExpiry = Infinity;
  const planDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const eventDateTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const planClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const planDateOnly = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  const planDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'short' });
  const planEnd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const midnightParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' });
  function nextMidnight(now) {
    const parts = Object.fromEntries(midnightParts.formatToParts(now).map(part => [part.type, part.value]));
    const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1);
    // In New York UTC midnight precedes local midnight by four or five hours.
    // Both instants precede the 02:00 DST transition, including transition days.
    const hour = Number(midnightParts.formatToParts(utc).find(part => part.type === 'hour').value);
    return utc + (24 - hour) % 24 * 3600000;
  }
  function invalidateContent() {
    contentRevision++; nextContentBoundary = 0;
    contentTimes = [...new Set([
      ...catalogue.flatMap(building => [...building.people, ...building.events].flatMap(entry => [entry.starts, entry.ends])),
      ...upcoming.flatMap(plan => [plan.starts, plan.ends]),
    ])].sort((a,b) => a-b);
  }
  function advanceContentClock(now) {
    if (now >= nextContentBoundary || now < previousWallTime) {
      contentRevision++;
      // Binary search avoids scanning all upcoming plans on every animation frame.
      let low = 0, high = contentTimes.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (contentTimes[middle] <= now) low = middle + 1; else high = middle;
      }
      nextContentBoundary = Math.min(contentTimes[low] ?? Infinity, nextMidnight(now));
    }
    previousWallTime = now;
  }
  function updateBuildingCard() {
    const key = `${contentRevision}:${focusSessionId}:${focusedPersonId}`;
    if (key === buildingCardKey) return;
    buildingCardKey = key;
    const building = catalogue.find(entry => entry.id === focusSessionId);
    const fallback = campusBuildings.find(entry => entry.id === focusSessionId);
    const wasHidden = buildingCard.hidden;
    buildingCard.hidden = !focusSessionId || Boolean(focusedPersonId) || !fallback;
    if (buildingCard.hidden) {
      buildingCardId = null;
      buildingCard.classList.remove('is-opening');
      return;
    }
    if (wasHidden || buildingCardId !== focusSessionId) {
      buildingCard.classList.remove('is-opening');
      void buildingCard.offsetWidth;
      buildingCard.classList.add('is-opening');
      buildingCardId = focusSessionId;
    }
    const events = building?.events.filter(event => event.ends > Date.now()) ?? [];
    const available = status === 'ok' && Boolean(building);
    const heading = document.createElement('h2');
    heading.textContent = building?.name ?? fallback.name;
    buildingCard.replaceChildren(heading);
    const section = title => {
      const element = document.createElement('section');
      const label = document.createElement('h3'); label.textContent = title;
      element.append(label); buildingCard.append(element);
      return element;
    };
    const empty = (parent, message) => {
      const text = document.createElement('p'); text.className = 'map-presence__building-empty';
      text.textContent = message; parent.append(text);
    };
    const scheduled = section('Scheduled events');
    scheduled.className = 'map-presence__scheduled-events';
    if (!events.length) empty(scheduled, available ? 'No scheduled events recorded.' : 'Events are unavailable right now.');
    else {
      const list = document.createElement('ol');
      for (const event of events) {
        const row = document.createElement('li');
        const details = document.createElement('div');
        details.className = 'map-presence__event-details';
        const title = document.createElement('strong'); title.textContent = event.title;
        const time = document.createElement('time'); time.dateTime = event.startsAt;
        time.className = 'map-presence__event-time';
        time.textContent = event.allDay ? `${new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(event.starts)} · All day` : `${eventDateTime.format(event.starts)} – ${(planDay.format(event.starts) === planDay.format(event.ends) ? planEnd : eventDateTime).format(event.ends)}`;
        const metadata = document.createElement('div');
        metadata.className = 'map-presence__event-meta';
        metadata.append(time);
        const room = eventRoom(event.location, building?.name ?? fallback.name);
        if (room) { const place = document.createElement('div'); place.className = 'map-presence__event-room'; place.textContent = room; metadata.append(place); }
        details.append(title, metadata);
        if (event.status === 'tentative') { const tentative = document.createElement('span'); tentative.textContent = 'Tentative'; details.append(tentative); }
        if (event.url) {
          try {
            const url = new URL(event.url);
            if (url.protocol === 'https:' && !url.username && !url.password) {
              const link = document.createElement('a'); link.href = url.href; link.textContent = 'Event details'; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link);
            }
          } catch {}
        }
        row.append(details);
        if (event.attendees.length) {
          row.classList.add('has-event-attendees');
          const attendees = document.createElement('div');
          attendees.className = 'map-presence__event-attendees';
          attendees.setAttribute('role', 'group');
          attendees.setAttribute('aria-label', 'Event attendees');
          for (const person of event.attendees) {
            const portrait = document.createElement('span');
            portrait.className = 'map-presence__event-avatar';
            portrait.title = person.displayName;
            const url = portraitUrl(person.avatarUrl);
            if (url) {
              const image = document.createElement('img');
              image.src = url; image.alt = person.displayName; image.draggable = false;
              image.addEventListener('error', () => { image.remove(); portrait.textContent = initials(person.displayName); portrait.setAttribute('aria-label', person.displayName); }, { once: true });
              portrait.append(image);
            } else { portrait.textContent = initials(person.displayName); portrait.setAttribute('aria-label', person.displayName); }
            attendees.append(portrait);
          }
          row.append(attendees);
        }
        list.append(row);
      }
      scheduled.append(list);
    }
  }
  function updateItinerary() {
    const key = `${contentRevision}:${focusSessionId}:${focusedPersonId}`;
    if (key === itineraryKey) return;
    itineraryKey = key;
    const building = source.find(building => building.id === focusSessionId);
    const person = building?.people.find(person => person.id === focusedPersonId);
    const wasHidden = itinerary.hidden;
    itinerary.hidden = !person;
    if (!person) { itineraryPersonKey = null; itinerary.classList.remove('is-opening'); return; }
    const personKey = `${building.id}:${person.id}`;
    if (wasHidden || itineraryPersonKey !== personKey) {
      itinerary.classList.remove('is-opening');
      void itinerary.offsetWidth;
      itinerary.classList.add('is-opening');
      itineraryPersonKey = personKey;
    }
    const now = Date.now();
    const plans = upcoming.filter(plan => plan.personId === person.id && plan.ends > now);
    const otherCurrent = source.flatMap(location => location.id === building.id ? [] : location.people.filter(entry => entry.id === person.id).map(entry => ({
      buildingId: location.id, buildingName: location.name, label: entry.label,
      validFrom: entry.validFrom, expiresAt: entry.expiresAt, starts: entry.starts, ends: entry.ends,
    })));
    const entries = [{ buildingId: building.id, buildingName: building.name, label: person.label,
      validFrom: person.validFrom, expiresAt: person.expiresAt, starts: person.starts, ends: person.ends, current: true },
      ...[...otherCurrent, ...plans].sort((a,b)=>a.starts-b.starts)]
      .map(plan=>({ ...plan, highlighted: plan.starts <= now && now < plan.ends }));
    const name = document.createElement('p');
    name.className = 'map-presence__itinerary-name';
    name.textContent = person.displayName;
    const heading = document.createElement('h2');
    heading.textContent = 'Schedule';
    itinerary.replaceChildren(name, heading);
    const list = document.createElement('ol');
    for (const plan of entries) {
      const item = document.createElement('li');
      item.classList.toggle('is-current-time', plan.highlighted);
      const location = document.createElement('strong'); location.textContent = plan.buildingName;
      const time = document.createElement(plan.current ? 'span' : 'time');
      time.className = 'map-presence__itinerary-subtitle';
      if (plan.current) item.setAttribute('aria-current', 'location');
      else time.dateTime = plan.validFrom;
      const dateOnly = planClock.format(plan.starts) === '00:00' && planClock.format(plan.ends) === '00:00' && plan.ends - plan.starts >= 23 * 3600000 && plan.ends - plan.starts <= 25 * 3600000;
      time.textContent = plan.current ? 'Current location' : dateOnly ? `${planDateOnly.format(plan.starts)} · Time not specified` : `${planDate.format(plan.starts)} – ${(planDay.format(plan.starts) === planDay.format(plan.ends) ? planEnd : planDate).format(plan.ends)}`;
      const content = document.createElement('div');
      content.className = 'map-presence__itinerary-content';
      if (plan.label.trim()) time.textContent += ` · ${plan.label}`;
      time.title = time.textContent;
      content.append(location, time);
      const portrait = buildingPortraits.get(plan.buildingId);
      if (portrait) {
        const image = document.createElement('img');
        image.className = 'map-presence__building-portrait';
        image.src = portrait; image.alt = ''; image.width = image.height = 56;
        image.loading = 'lazy'; image.decoding = 'async'; image.draggable = false;
        image.addEventListener('error', () => { image.remove(); item.classList.remove('has-building-portrait'); }, { once: true });
        item.classList.add('has-building-portrait');
        item.append(image);
      }
      item.append(content);
      list.append(item);
    }
    itinerary.append(list);
    if (status !== 'ok' || !upcomingAvailable || !plans.length) {
      const empty = document.createElement('p');
      empty.className = 'map-presence__itinerary-empty';
      empty.textContent = status !== 'ok' || !upcomingAvailable ? 'Upcoming locations are unavailable right now.' : 'No upcoming locations recorded.';
      itinerary.append(empty);
    }
  }
  function dragDestination(item, personFocused, x, y) {
    const size = item.group.sizeFactor * item.group.rect.diameter * (personFocused ? 1.5 : 1);
    const note = item.button.querySelector('.map-presence__note');
    return clampFocusedAvatarPosition({ x, y, frame: item.group.rect, size,
      noteWidth: note?.offsetWidth ?? 0, noteHeight: note?.offsetHeight ?? 0 });
  }
  function endDrag(settle = true) {
    if (!drag) return;
    const current = drag; drag = null;
    current.item.button.dataset.dragging = 'false';
    if (current.item.button.hasPointerCapture?.(current.pointerId)) current.item.button.releasePointerCapture(current.pointerId);
    if (current.moved && settle && current.item.group.focused) {
      const target = dragDestination(current.item, current.personFocused, current.x, current.y);
      current.item.dragReturning = Math.hypot(current.x - current.item.group.rect.left - target.u * current.item.group.rect.width,
        current.y - current.item.group.rect.top - target.v * current.item.group.rect.height) > 0.5;
      if (current.personFocused) current.item.personDragTarget = target;
      else current.item.focusTarget = target;
    }
  }
  function beginDrag(event, item) {
    event.stopPropagation();
    item.suppressClick = false;
    if (drag || event.button !== 0 || event.isPrimary === false || getFocusedBuilding() !== item.building.id || !item.group.rect?.width || !item.group.rect?.height) return;
    drag = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      startCenterX: item.dx, startCenterY: item.dy, x: item.dx, y: item.dy,
      personFocused: item.person.id === focusedPersonId, moved: false };
    item.button.setPointerCapture(event.pointerId);
  }
  function moveDrag(event, item) {
    if (!drag || drag.item !== item || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    event.preventDefault(); drag.moved = true;
    drag.x = drag.startCenterX + dx; drag.y = drag.startCenterY + dy;
    item.button.dataset.dragging = 'true';
    update();
  }
  function releaseDrag(event, item) {
    if (!drag || drag.item !== item || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (drag.moved) { event.preventDefault(); item.suppressClick = true; }
    endDrag(); update();
  }
  function rebuild() {
    endDrag();
    const focused = groups.flatMap(group => group.items).find(item => item.button === document.activeElement);
    const previousGroups = new Map(groups.map(group => [group.building.id, group]));
    const previousPositions = new Map(groups.flatMap(group => group.items.map(item => [`${group.building.id}:${item.person.id}`, { u: item.u, v: item.v, dx: item.dx, dy: item.dy, motionU: item.motionU, motionV: item.motionV, target: item.target, personScale: item.personScale, focusTarget: item.focusTarget, personDragTarget: item.personDragTarget, dragReturning: item.dragReturning }])));
    groups.forEach(group => group.element.remove());
    groups = source.map(building => {
      const element = document.createElement('div');
      element.className = 'map-presence__group';
      element.dataset.buildingId = building.id;
      element.hidden = true;
      const group = { root: null, ...previousGroups.get(building.id), building, element, items: [], visible: false };
      building.people.forEach(person => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-presence__person';
        button.dataset.personId = person.id;
        if (revealed.has(`${building.id}:${person.id}`)) button.classList.add('is-settled');
        button.setAttribute('aria-label', [person.displayName, building.name, ...(person.label.trim() ? [person.label] : [])].join(' · '));
        button.setAttribute('aria-pressed', 'false');
        const portrait = document.createElement('span');
        portrait.className = 'map-presence__portrait';
        portrait.setAttribute('aria-hidden', 'true');
        button.append(portrait);
        const fallback = document.createElement('span');
        fallback.className = 'map-presence__initials';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = initials(person.displayName);
        portrait.append(fallback);
        const url = portraitUrl(person.avatarUrl);
        if (url) {
          const image = document.createElement('img');
          image.src = url;
          image.alt = '';
          image.draggable = false;
          image.addEventListener('error', () => image.remove(), { once: true });
          portrait.append(image);
        }
        if (person.label.trim()) {
          const note = document.createElement('span');
          note.className = 'map-presence__note';
          note.setAttribute('aria-hidden', 'true');
          const text = document.createElement('span');
          text.className = 'map-presence__note-text';
          text.textContent = person.label;
          note.append(text);
          button.append(note);
        }
        const item = { person, building, button, group, dx: 0, dy: 0, visible: false, ...previousPositions.get(`${building.id}:${person.id}`) };
        button.addEventListener('pointerdown', event => beginDrag(event, item));
        button.addEventListener('pointermove', event => moveDrag(event, item));
        button.addEventListener('pointerup', event => releaseDrag(event, item));
        button.addEventListener('pointercancel', event => releaseDrag(event, item));
        button.addEventListener('lostpointercapture', () => { if (drag?.item === item) { endDrag(); update(); } });
        button.addEventListener('dblclick', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (event.detail && item.suppressClick) { item.suppressClick = false; event.preventDefault(); return; }
          if (getFocusedBuilding() === building.id) {
            item.personDragTarget = null;
            focusedPersonId = focusedPersonId === person.id ? null : person.id;
          } else {
            focusedPersonId = null;
            selectBuilding(building.id);
            focusBuilding();
          }
          update();
        });
        group.items.push(item);
        element.append(button);
      });
      layer.append(element);
      return group;
    });
    if (focusedPersonId && !groups.some(group => group.items.some(item => item.person.id === focusedPersonId))) focusedPersonId = null;
    update();
    const items = groups.flatMap(group => group.items);
    const replacementFocus = focused && items.find(item => item.building.id === focused.building.id && item.person.id === focused.person.id);
    replacementFocus?.button.focus({ preventScroll: true });

  }
  function expire() {
    const now = Date.now();
    if (now < nextMarkerExpiry && now >= previousWallTime) return;
    if (!source.some(building => building.people.some(person => !active(person, now)))) return;
    source = source.map(building => ({ ...building, people: building.people.filter(person => active(person, now)) })).filter(building => building.people.length);
    nextMarkerExpiry = source.reduce((end, building) => building.people.reduce((end, person) => Math.min(end, person.ends), end), Infinity);
    markerKey = markerSignature(source);
    invalidateContent();
    rebuild();
  }
  function update() {
    if (disposed) return;
    expire();
    advanceContentClock(Date.now());
    const width = container.clientWidth, height = container.clientHeight;
    const entered = document.getElementById('app')?.dataset.state === 'entered';
    const focusedId = getFocusedBuilding();
    if (focusedId !== focusSessionId) {
      endDrag(false);
      groups.forEach(group => group.items.forEach(item => { item.focusTarget = item.personDragTarget = null; item.dragReturning = false; }));
      focusSessionId = focusedId;
      focusSeed = Math.floor(Math.random() * 4294967296);
      focusedPersonId = null;
    }
    layer.dataset.personFocused = String(Boolean(focusedPersonId));
    updateItinerary();
    updateBuildingCard();
    if (!buildingCard.hidden) {
      const cardWidth = Math.max(120, Math.min(460, width * 0.52 - 32));
      buildingCard.style.left = `${width - cardWidth - 24}px`;
      buildingCard.style.width = `${cardWidth}px`;
      buildingCard.style.top = `${height / 2}px`;
    }
    let entranceIndex = 0;
    camera.updateMatrixWorld();
    const now = performance.now();
    const elapsed = Math.min(0.1, (now - previousFrame) / 1000);
    const blend = 1 - Math.exp(-elapsed * 4.5);
    const moveBlend = 1 - Math.exp(-elapsed * (4.5 / 1.3));
    previousFrame = now;
    for (const group of groups) {
      const root = getRoot(group.building.id);
      if (root && group.root !== root) {
        group.geometry = layout.prepare(root);
        group.root = root;
        group.mask = null;
      }
      const focused = focusedId === group.building.id;
      const focusWidth = Math.min(480, width * 0.44), focusHeight = Math.min(640, Math.max(1, height - 48));
      const rect = root && (focused ? { left: (width * 0.44 - focusWidth) / 2, top: (height - focusHeight) / 2, width: focusWidth, height: focusHeight, diameter: 1 } : layout.project(group.geometry, width, height));
      if (!rect || (focusedId && !focused)) {
        group.element.hidden = true;
        group.visible = false;
        group.items.forEach(item => { item.visible = false; });
        continue;
      }
      const changedMode = focused !== group.focused;
      if (changedMode && group.rect) {
        // Switching coordinate frames must preserve the current pixel positions
        // and diameter, so expansion/return starts exactly where portraits are.
        group.items.forEach(item => {
          item.motionU = item.u = (item.dx - rect.left) / rect.width;
          item.motionV = item.v = (item.dy - rect.top) / rect.height;
        });
        group.renderFactor = group.pixels / rect.diameter;
      }
      if (focused) {
        if (changedMode || group.viewportWidth !== rect.width || group.viewportHeight !== rect.height || group.viewportCount !== group.items.length) {
          const packed = layout.focused(rect.width, rect.height, group.items.length, focusSeed);
          group.sizeFactor = packed.diameter * 0.375;
          group.items.forEach((item, index) => { item.target = packed.points[index] ?? null; });
          group.viewportWidth = rect.width;
          group.viewportHeight = rect.height;
          group.viewportCount = group.items.length;
        }
      } else {
        const mask = layout.sample(group.geometry, rect, width, height, now);
        if (mask !== group.mask || changedMode) {
          group.mask = mask;
          const previous = group.items.map(item => changedMode ? { u: item.u, v: item.v } : item.target ?? (item.u === undefined ? null : { u: item.u, v: item.v }));
          const packed = layout.pack(mask, rect, group.items.length, previous);
          group.sizeFactor = packed.diameter / rect.diameter;
          group.items.forEach((item, index) => { item.target = packed.points[index] ?? null; });
        }
      }
      group.focused = focused;
      group.element.dataset.focused = String(focused);
      group.rect = rect;
      // Ease the layout itself. Re-snapping intermediate frames to mask-grid
      // candidates caused jitter and defeated the slower interpolation.
      group.renderFactor ??= group.sizeFactor;
      group.renderFactor += (group.sizeFactor - group.renderFactor) * blend;
      const pixels = rect.diameter * group.renderFactor;
      group.pixels = pixels;
      const positions = group.items.map(item => {
        if (!item.target) return null;
        item.motionU ??= item.u ?? item.target.u;
        item.motionV ??= item.v ?? item.target.v;
        const personFocused = focused && item.person.id === focusedPersonId;
        if (drag?.item === item) {
          item.motionU = (drag.x - rect.left) / rect.width;
          item.motionV = (drag.y - rect.top) / rect.height;
          return { u: item.motionU, v: item.motionV };
        }
        let target = focused ? personFocused ? item.personDragTarget ?? { u: 0.5, v: 0.5 } : item.focusTarget ?? item.target : item.target;
        if (focused && (personFocused ? item.personDragTarget : item.focusTarget)) {
          target = dragDestination(item, personFocused, rect.left + target.u * rect.width, rect.top + target.v * rect.height);
          if (personFocused) item.personDragTarget = target;
          else item.focusTarget = target;
        }
        const returningBlend = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed * 14);
        const positionBlend = item.dragReturning ? returningBlend : moveBlend;
        item.motionU += (target.u - item.motionU) * positionBlend;
        item.motionV += (target.v - item.motionV) * positionBlend;
        if (item.dragReturning && Math.hypot((target.u - item.motionU) * rect.width, (target.v - item.motionV) * rect.height) < 0.15) {
          item.motionU = target.u; item.motionV = target.v; item.dragReturning = false;
        }
        return { u: item.motionU, v: item.motionV };
      });
      group.visible = false;
      group.element.hidden = false;
      group.items.forEach((item, index) => {
        const position = positions[index];
        item.visible = Boolean(position);
        item.button.hidden = !item.visible;
        if (!position) return;
        group.visible = true;
        item.u = position.u;
        item.v = position.v;
        item.dx = rect.left + position.u * rect.width;
        item.dy = rect.top + position.v * rect.height;
        const key = `${group.building.id}:${item.person.id}`;
        if (entered && !revealed.has(key)) {
          revealed.add(key);
          item.button.style.setProperty('--reveal-delay', `${entranceIndex++ * 90}ms`);
          item.button.classList.add('is-entering');
        }
        const personFocused = focused && item.person.id === focusedPersonId;
        item.personScale ??= 1;
        item.personScale += ((personFocused ? 1.5 : 1) - item.personScale) * blend;
        item.size = pixels * item.personScale;
        item.button.dataset.personFocused = String(personFocused);
        item.button.setAttribute('aria-pressed', String(personFocused));
        const noteScale = Math.pow(Math.max(1, group.items.length), -0.12);
        // Wrap against the destination portrait, not its growing entrance size.
        item.button.style.setProperty('--note-anchor-size', `${rect.diameter * group.sizeFactor * (personFocused ? 1.5 : 1)}px`);
        item.button.style.setProperty('--note-font', `${16 * noteScale * (personFocused ? 1.15 : 1)}px`);
        item.button.style.width = `${item.size}px`;
        item.button.style.height = `${item.size}px`;
        item.button.style.fontSize = `${item.size / 3}px`;
        item.button.style.zIndex = drag?.item === item && drag.moved ? '4' : personFocused ? '3' : '1';
        item.button.style.transform = `translate(${item.dx}px, ${item.dy}px) translate(-50%, -50%)`;
      });
      group.element.hidden = !group.visible;
    }
    if (!itinerary.hidden) {
      const person = groups.find(group => group.building.id === focusSessionId)?.items.find(item => item.person.id === focusedPersonId);
      if (person?.visible) {
        const left = person.dx + person.size / 2 + 20;
        itinerary.style.left = `${left}px`;
        itinerary.style.width = `${Math.min(360, Math.max(0, width - left - 16))}px`;
        const halfHeight = itinerary.offsetHeight / 2;
        const top = Math.max(16 + halfHeight, Math.min(height - 16 - halfHeight, person.dy));
        itinerary.style.top = `${top}px`;
      }
    }
  }

  function refresh() {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    const controller = new AbortController();
    requestController = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    pending = (async () => {
      try {
        const response = await fetchImpl('/api/map/presence', { signal: controller.signal, headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Map presence unavailable');
        const payload = await response.json();
        const next = parsePresence(payload);
        const nextUpcoming = payload.upcoming === undefined ? [] : parseUpcoming(payload.upcoming);
        if (disposed) return;
        const nextSource = next.filter(building => building.people.length);
        const nextMarkerKey = markerSignature(nextSource);
        const nextContentKey = contentSignature(next, nextUpcoming);
        const markersChanged = markerKey !== nextMarkerKey;
        const contentChanged = contentKey !== nextContentKey || status !== 'ok' || upcomingAvailable !== Array.isArray(payload.upcoming);
        catalogue = next;
        source = nextSource;
        nextMarkerExpiry = source.reduce((end, building) => building.people.reduce((end, person) => Math.min(end, person.ends), end), Infinity);
        upcoming = nextUpcoming;
        upcomingAvailable = Array.isArray(payload.upcoming);
        observedAt = typeof payload.observedAt === 'string' ? payload.observedAt : null;
        status = 'ok';
        markerKey = nextMarkerKey; contentKey = nextContentKey;
        if (contentChanged) invalidateContent();
        if (markersChanged) rebuild(); else update();
      } catch {
        if (!disposed) {
          catalogue = []; source = []; upcoming = []; upcomingAvailable = false;
          status = 'unavailable'; observedAt = null; markerKey = contentKey = '';
          nextMarkerExpiry = Infinity;
          invalidateContent(); rebuild();
        }
      } finally { clearTimeout(timeout); pending = null; requestController = null; }
    })();
    return pending;
  }
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('.map-presence__person')) focusedPersonId = null;
  }, { signal: listeners.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { endDrag(); update(); event.stopPropagation(); }
    if (event.key === 'Escape' && focusedPersonId) { focusedPersonId = null; event.stopPropagation(); }
  }, { signal: listeners.signal });
  const refreshVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
  // A poll started before the save may still contain stale attendance. Queue a
  // fresh read after it settles instead of sharing that pre-write response.
  const refreshAfterWrite = () => { if (pending) void pending.then(refreshVisible); else refreshVisible(); };
  window.addEventListener('blur', () => { endDrag(); update(); }, { signal: listeners.signal });
  window.addEventListener('focus', refreshVisible, { signal: listeners.signal });
  document.addEventListener('visibilitychange', refreshVisible, { signal: listeners.signal });
  document.addEventListener('campus-map-updated', refreshAfterWrite, { signal: listeners.signal });
  const poll = setInterval(refreshVisible, 30000);
  const expiry = setInterval(expire, 1000);
  void refresh();
  return Object.freeze({
    update, refresh,
    snapshot: () => ({ status, observedAt, count: groups.reduce((sum, group) => sum + group.items.length, 0), buildings: groups.map(group => ({ id: group.building.id, visible: group.visible, count: group.items.length })) }),
    dispose() { disposed = true; endDrag(false); requestController?.abort(); clearInterval(poll); clearInterval(expiry); listeners.abort(); layout.dispose(); layer.remove(); },
  });
}
