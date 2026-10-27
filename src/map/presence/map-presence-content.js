import { resolveMapAvatarUrl } from './map-avatar-url.js';

import { buildings as campusBuildings } from '../data/config.js';
import { portraits, buildingPortraits, eventRoom, initials } from './map-presence-helpers.js';

export function installMapPresenceContent(view) {
  view.nextMidnight = function nextMidnight(now) {
    const parts = Object.fromEntries(
      view.midnightParts.formatToParts(now).map((part) => [part.type, part.value]),
    );
    const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1);
    // In New York UTC midnight precedes local midnight by four or five hours.
    // Both instants precede the 02:00 DST transition, including transition days.
    const hour = Number(
      view.midnightParts.formatToParts(utc).find((part) => part.type === 'hour').value,
    );
    return utc + ((24 - hour) % 24) * 3600000;
  };
  view.invalidateContent = function invalidateContent() {
    view.contentRevision++;
    view.nextContentBoundary = 0;
    view.contentTimes = [
      ...new Set([
        ...view.catalogue.flatMap((building) =>
          [...building.people, ...building.events].flatMap((entry) => [entry.starts, entry.ends]),
        ),
        ...view.upcoming.flatMap((plan) => [plan.starts, plan.ends]),
      ]),
    ].sort((a, b) => a - b);
  };
  view.advanceContentClock = function advanceContentClock(now) {
    if (now >= view.nextContentBoundary || now < view.previousWallTime) {
      view.contentRevision++;
      // Binary search avoids scanning all upcoming plans on every animation frame.
      let low = 0,
        high = view.contentTimes.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (view.contentTimes[middle] <= now) low = middle + 1;
        else high = middle;
      }
      view.nextContentBoundary = Math.min(
        view.contentTimes[low] ?? Infinity,
        view.nextMidnight(now),
      );
    }
    view.previousWallTime = now;
  };
  view.updateBuildingCard = function updateBuildingCard() {
    const key = `${view.contentRevision}:${view.focusSessionId}:${view.focusedPersonId}`;
    if (key === view.buildingCardKey) return;
    view.buildingCardKey = key;
    const building = view.catalogue.find((entry) => entry.id === view.focusSessionId);
    const fallback = campusBuildings.find((entry) => entry.id === view.focusSessionId);
    const wasHidden = view.buildingCard.hidden;
    view.buildingCard.hidden = !view.focusSessionId || Boolean(view.focusedPersonId) || !fallback;
    if (view.buildingCard.hidden) {
      view.buildingCardId = null;
      view.buildingCard.classList.remove('is-opening');
      return;
    }
    if (wasHidden || view.buildingCardId !== view.focusSessionId) {
      view.buildingCard.classList.remove('is-opening');
      void view.buildingCard.offsetWidth;
      view.buildingCard.classList.add('is-opening');
      view.buildingCardId = view.focusSessionId;
    }
    const events = building?.events.filter((event) => event.ends > Date.now()) ?? [];
    const available = view.status === 'ok' && Boolean(building);
    const heading = document.createElement('h2');
    heading.textContent = building?.name ?? fallback.name;
    view.buildingCard.replaceChildren(heading);
    const section = (title) => {
      const element = document.createElement('section');
      const label = document.createElement('h3');
      label.textContent = title;
      element.append(label);
      view.buildingCard.append(element);
      return element;
    };
    const empty = (parent, message) => {
      const text = document.createElement('p');
      text.className = 'map-presence__building-empty';
      text.textContent = message;
      parent.append(text);
    };
    const scheduled = section('Scheduled events');
    scheduled.className = 'map-presence__scheduled-events';
    if (!events.length)
      empty(
        scheduled,
        available ? 'No scheduled events recorded.' : 'Events are unavailable right now.',
      );
    else {
      const list = document.createElement('ol');
      for (const event of events) {
        const row = document.createElement('li');
        const details = document.createElement('div');
        details.className = 'map-presence__event-details';
        const title = document.createElement('strong');
        title.textContent = event.title;
        const time = document.createElement('time');
        time.dateTime = event.startsAt;
        time.className = 'map-presence__event-time';
        time.textContent = event.allDay
          ? `${new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(event.starts)} · All day`
          : `${view.eventDateTime.format(event.starts)} – ${(view.planDay.format(event.starts) === view.planDay.format(event.ends) ? view.planEnd : view.eventDateTime).format(event.ends)}`;
        const metadata = document.createElement('div');
        metadata.className = 'map-presence__event-meta';
        metadata.append(time);
        const room = eventRoom(event.location, building?.name ?? fallback.name);
        if (room) {
          const place = document.createElement('div');
          place.className = 'map-presence__event-room';
          place.textContent = room;
          metadata.append(place);
        }
        details.append(title, metadata);
        if (event.status === 'tentative') {
          const tentative = document.createElement('span');
          tentative.textContent = 'Tentative';
          details.append(tentative);
        }
        if (event.url) {
          try {
            const url = new URL(event.url);
            if (url.protocol === 'https:' && !url.username && !url.password) {
              const link = document.createElement('a');
              link.href = url.href;
              link.textContent = 'Event details';
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              details.append(link);
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
            const url = resolveMapAvatarUrl(person.avatarUrl, person.id, portraits);
            if (url) {
              const image = document.createElement('img');
              image.src = url;
              image.alt = person.displayName;
              image.draggable = false;
              image.addEventListener(
                'error',
                () => {
                  image.remove();
                  portrait.textContent = initials(person.displayName);
                  portrait.setAttribute('aria-label', person.displayName);
                },
                { once: true },
              );
              portrait.append(image);
            } else {
              portrait.textContent = initials(person.displayName);
              portrait.setAttribute('aria-label', person.displayName);
            }
            attendees.append(portrait);
          }
          row.append(attendees);
        }
        list.append(row);
      }
      scheduled.append(list);
    }
  };
  view.updateItinerary = function updateItinerary() {
    const key = `${view.contentRevision}:${view.focusSessionId}:${view.focusedPersonId}`;
    if (key === view.itineraryKey) return;
    view.itineraryKey = key;
    const building = view.source.find((building) => building.id === view.focusSessionId);
    const person = building?.people.find((person) => person.id === view.focusedPersonId);
    const wasHidden = view.itinerary.hidden;
    view.itinerary.hidden = !person;
    if (!person) {
      view.itineraryPersonKey = null;
      view.itinerary.classList.remove('is-opening');
      return;
    }
    const personKey = `${building.id}:${person.id}`;
    if (wasHidden || view.itineraryPersonKey !== personKey) {
      view.itinerary.classList.remove('is-opening');
      void view.itinerary.offsetWidth;
      view.itinerary.classList.add('is-opening');
      view.itineraryPersonKey = personKey;
    }
    const now = Date.now();
    const plans = view.upcoming.filter((plan) => plan.personId === person.id && plan.ends > now);
    const otherCurrent = view.source.flatMap((location) =>
      location.id === building.id
        ? []
        : location.people
            .filter((entry) => entry.id === person.id)
            .map((entry) => ({
              buildingId: location.id,
              buildingName: location.name,
              label: entry.label,
              validFrom: entry.validFrom,
              expiresAt: entry.expiresAt,
              starts: entry.starts,
              ends: entry.ends,
            })),
    );
    const entries = [
      {
        buildingId: building.id,
        buildingName: building.name,
        label: person.label,
        validFrom: person.validFrom,
        expiresAt: person.expiresAt,
        starts: person.starts,
        ends: person.ends,
        current: true,
      },
      ...[...otherCurrent, ...plans].sort((a, b) => a.starts - b.starts),
    ].map((plan) => ({ ...plan, highlighted: plan.starts <= now && now < plan.ends }));
    const name = document.createElement('p');
    name.className = 'map-presence__itinerary-name';
    name.textContent = person.displayName;
    const heading = document.createElement('h2');
    heading.textContent = 'Schedule';
    view.itinerary.replaceChildren(name, heading);
    const list = document.createElement('ol');
    for (const plan of entries) {
      const item = document.createElement('li');
      item.classList.toggle('is-current-time', plan.highlighted);
      const location = document.createElement('strong');
      location.textContent = plan.buildingName;
      const time = document.createElement(plan.current ? 'span' : 'time');
      time.className = 'map-presence__itinerary-subtitle';
      if (plan.current) item.setAttribute('aria-current', 'location');
      else time.dateTime = plan.validFrom;
      const dateOnly =
        view.planClock.format(plan.starts) === '00:00' &&
        view.planClock.format(plan.ends) === '00:00' &&
        plan.ends - plan.starts >= 23 * 3600000 &&
        plan.ends - plan.starts <= 25 * 3600000;
      time.textContent = plan.current
        ? 'Current location'
        : dateOnly
          ? `${view.planDateOnly.format(plan.starts)} · Time not specified`
          : `${view.planDate.format(plan.starts)} – ${(view.planDay.format(plan.starts) === view.planDay.format(plan.ends) ? view.planEnd : view.planDate).format(plan.ends)}`;
      const content = document.createElement('div');
      content.className = 'map-presence__itinerary-content';
      if (plan.label.trim()) time.textContent += ` · ${plan.label}`;
      time.title = time.textContent;
      content.append(location, time);
      const portrait = buildingPortraits.get(plan.buildingId);
      if (portrait) {
        const image = document.createElement('img');
        image.className = 'map-presence__building-portrait';
        image.src = portrait;
        image.alt = '';
        image.width = image.height = 56;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.draggable = false;
        image.addEventListener(
          'error',
          () => {
            image.remove();
            item.classList.remove('has-building-portrait');
          },
          { once: true },
        );
        item.classList.add('has-building-portrait');
        item.append(image);
      }
      item.append(content);
      list.append(item);
    }
    view.itinerary.append(list);
    if (view.status !== 'ok' || !view.upcomingAvailable || !plans.length) {
      const empty = document.createElement('p');
      empty.className = 'map-presence__itinerary-empty';
      empty.textContent =
        view.status !== 'ok' || !view.upcomingAvailable
          ? 'Upcoming locations are unavailable right now.'
          : 'No upcoming locations recorded.';
      view.itinerary.append(empty);
    }
  };
}
