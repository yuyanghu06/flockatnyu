import { createPresenceLayout } from './map-presence-layout.js';
import { buildings as campusBuildings } from './config.js';
import './map-presence.css';

// Vite includes every approved portrait in production, without trusting source URLs.
const portraitImports = import.meta.glob('../assets/avatars/*.png', { eager: true, query: '?url', import: 'default' });
const portraits = new Map(Object.entries(portraitImports).map(([path, url]) => [path.split('/').at(-1), url]));
const buildingPortraitImports = import.meta.glob('../assets/building-portraits/*-v1.webp', { eager: true, query: '?url', import: 'default' });
const buildingPortraits = new Map(Object.entries(buildingPortraitImports).map(([path, url]) => [path.split('/').at(-1).replace(/-v1\.webp$/, ''), url]));
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
  if (payload?.status !== 'ok' || !Array.isArray(payload.buildings) || payload.buildings.length > 64) throw new Error('Invalid map presence');
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
    if (!Array.isArray(events) || events.length > 200) throw new Error('Invalid building events');
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
  let upcoming = [], upcomingAvailable = false, itineraryKey = null, itineraryPersonKey = null;
  const planDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const planClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const planDateOnly = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  const planDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', dateStyle: 'short' });
  const planEnd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  const buildingDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
  function updateBuildingCard() {
    const building = catalogue.find(entry => entry.id === focusSessionId);
    const fallback = campusBuildings.find(entry => entry.id === focusSessionId);
    const wasHidden = buildingCard.hidden;
    buildingCard.hidden = !focusSessionId || Boolean(focusedPersonId) || !fallback;
    if (buildingCard.hidden) {
      buildingCardKey = buildingCardId = null;
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
    const dateLabel = buildingDate.format(Date.now());
    const key = JSON.stringify([focusSessionId, available, events, dateLabel]);
    if (key === buildingCardKey) return;
    buildingCardKey = key;
    const heading = document.createElement('h2');
    heading.textContent = building?.name ?? fallback.name;
    const date = document.createElement('p');
    date.className = 'map-presence__building-date';
    date.textContent = dateLabel;
    buildingCard.replaceChildren(heading, date);
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
    if (!events.length) empty(scheduled, available ? 'No scheduled events recorded.' : 'Events are unavailable right now.');
    else {
      const list = document.createElement('ol');
      for (const event of events) {
        const row = document.createElement('li');
        const details = document.createElement('div');
        details.className = 'map-presence__event-details';
        const title = document.createElement('strong'); title.textContent = event.title;
        const time = document.createElement('time'); time.dateTime = event.startsAt;
        time.textContent = event.allDay ? `${planDateOnly.format(event.starts)} · All day` : `${planDate.format(event.starts)} – ${(planDay.format(event.starts) === planDay.format(event.ends) ? planEnd : planDate).format(event.ends)}`;
        details.append(title, time);
        if (event.status === 'tentative') { const tentative = document.createElement('span'); tentative.textContent = 'Tentative'; details.append(tentative); }
        if (event.location) { const place = document.createElement('span'); place.textContent = event.location; details.append(place); }
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
    const building = source.find(building => building.id === focusSessionId);
    const person = building?.people.find(person => person.id === focusedPersonId);
    const wasHidden = itinerary.hidden;
    itinerary.hidden = !person;
    if (!person) { itineraryKey = null; itineraryPersonKey = null; itinerary.classList.remove('is-opening'); return; }
    const personKey = `${building.id}:${person.id}`;
    if (wasHidden || itineraryPersonKey !== personKey) {
      itinerary.classList.remove('is-opening');
      void itinerary.offsetWidth;
      itinerary.classList.add('is-opening');
      itineraryPersonKey = personKey;
    }
    const now = Date.now();
    const plans = upcoming.filter(plan => plan.personId === person.id && plan.buildingId !== building.id && plan.ends > now);
    const otherCurrent = source.flatMap(location => location.id === building.id ? [] : location.people.filter(entry => entry.id === person.id).map(entry => ({
      buildingId: location.id, buildingName: location.name, label: entry.label,
      validFrom: entry.validFrom, expiresAt: entry.expiresAt, starts: entry.starts, ends: entry.ends,
    })));
    const entries = [{ buildingId: building.id, buildingName: building.name, label: person.label,
      validFrom: person.validFrom, expiresAt: person.expiresAt, starts: person.starts, ends: person.ends, current: true },
      ...[...otherCurrent, ...plans].sort((a,b)=>a.starts-b.starts)]
      .map(plan=>({ ...plan, highlighted: plan.starts <= now && now < plan.ends }));
    const key = JSON.stringify([person.id,person.displayName,status,upcomingAvailable,entries]);
    if (key === itineraryKey) return;
    itineraryKey = key;
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
  function rebuild() {
    const focused = groups.flatMap(group => group.items).find(item => item.button === document.activeElement);
    const previousGroups = new Map(groups.map(group => [group.building.id, group]));
    const previousPositions = new Map(groups.flatMap(group => group.items.map(item => [`${group.building.id}:${item.person.id}`, { u: item.u, v: item.v, dx: item.dx, dy: item.dy, motionU: item.motionU, motionV: item.motionV, target: item.target, personScale: item.personScale }])));
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
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('dblclick', event => event.stopPropagation());
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (getFocusedBuilding() === building.id) {
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
    if (!source.some(building => building.people.some(person => !active(person, now)))) return;
    source = source.map(building => ({ ...building, people: building.people.filter(person => active(person, now)) })).filter(building => building.people.length);
    rebuild();
  }
  function update() {
    if (disposed) return;
    expire();
    const width = container.clientWidth, height = container.clientHeight;
    const entered = document.getElementById('app')?.dataset.state === 'entered';
    const focusedId = getFocusedBuilding();
    if (focusedId !== focusSessionId) {
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
        const target = personFocused ? { u: 0.5, v: 0.5 } : item.target;
        item.motionU += (target.u - item.motionU) * moveBlend;
        item.motionV += (target.v - item.motionV) * moveBlend;
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
        item.button.style.setProperty('--note-font', `${16 * noteScale * (personFocused ? 1.15 : 1)}px`);
        item.button.style.width = `${item.size}px`;
        item.button.style.height = `${item.size}px`;
        item.button.style.fontSize = `${item.size / 3}px`;
        item.button.style.zIndex = personFocused ? '3' : '1';
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
        catalogue = next;
        source = next.filter(building => building.people.length);
        upcoming = nextUpcoming;
        upcomingAvailable = Array.isArray(payload.upcoming);
        observedAt = typeof payload.observedAt === 'string' ? payload.observedAt : null;
        status = 'ok';
        rebuild();
      } catch {
        if (!disposed) { catalogue = []; source = []; upcoming = []; upcomingAvailable = false; status = 'unavailable'; observedAt = null; rebuild(); }
      } finally { clearTimeout(timeout); pending = null; requestController = null; }
    })();
    return pending;
  }
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('.map-presence__person')) focusedPersonId = null;
  }, { signal: listeners.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focusedPersonId) { focusedPersonId = null; event.stopPropagation(); }
  }, { signal: listeners.signal });
  const refreshVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
  window.addEventListener('focus', refreshVisible, { signal: listeners.signal });
  document.addEventListener('visibilitychange', refreshVisible, { signal: listeners.signal });
  const poll = setInterval(refreshVisible, 30000);
  const expiry = setInterval(expire, 1000);
  void refresh();
  return Object.freeze({
    update, refresh,
    snapshot: () => ({ status, observedAt, count: groups.reduce((sum, group) => sum + group.items.length, 0), buildings: groups.map(group => ({ id: group.building.id, visible: group.visible, count: group.items.length })) }),
    dispose() { disposed = true; requestController?.abort(); clearInterval(poll); clearInterval(expiry); listeners.abort(); layout.dispose(); layer.remove(); },
  });
}
