export const portraitImports = import.meta.glob('../../../assets/avatars/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
export const portraits = new Map(
  Object.entries(portraitImports).map(([path, url]) => [path.split('/').at(-1), url]),
);
export const buildingPortraitImports = import.meta.glob(
  '../../../assets/building-portraits/*-v1.webp',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
);
export const buildingPortraits = new Map(
  Object.entries(buildingPortraitImports).map(([path, url]) => [
    path
      .split('/')
      .at(-1)
      .replace(/-v1\.webp$/, ''),
    url,
  ]),
);
export function eventRoom(value, buildingName) {
  if (typeof value !== 'string') return '';
  const location = value.trim();
  const parts = /^(.+?)\s*[·—–]\s*(.*)$/u.exec(location) ?? /^(.+?),\s*(.*)$/u.exec(location);
  const prefix = (parts?.[1] ?? location).trim().toLocaleLowerCase();
  const name = buildingName.trim().toLocaleLowerCase();
  if (prefix.length >= 3 && (name === prefix || name.startsWith(`${prefix} `)))
    return (parts?.[2] ?? '').trim();
  return location;
}
export function initials(name) {
  return name
    .trim()
    .split(/\s+/u)
    .map((part) => [...part][0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
export function active(person, now = Date.now()) {
  return person.starts <= now && now < person.ends;
}
export function parsePresence(payload) {
  if (
    payload?.status !== 'ok' ||
    !Array.isArray(payload.buildings) ||
    payload.buildings.length > 100
  )
    throw new Error('Invalid map presence');
  const seen = new Set();
  const buildingIds = new Set();
  return payload.buildings.map((building) => {
    if (
      typeof building?.id !== 'string' ||
      typeof building.name !== 'string' ||
      !Array.isArray(building.people) ||
      building.people.length > 1000
    )
      throw new Error('Invalid building presence');
    if (buildingIds.has(building.id)) throw new Error('Duplicate building');
    buildingIds.add(building.id);
    const people = building.people
      .map((person) => {
        const starts = Date.parse(person?.validFrom),
          ends = Date.parse(person?.expiresAt);
        const key = `${building.id}:${person?.id}`;
        if (
          typeof person?.id !== 'string' ||
          !person.id ||
          typeof person.displayName !== 'string' ||
          !person.displayName.trim() ||
          typeof person.label !== 'string' ||
          [...person.label].length > 200 ||
          !['planned', 'self_reported'].includes(person.status) ||
          !Number.isFinite(starts) ||
          !Number.isFinite(ends) ||
          ends <= starts ||
          seen.has(key)
        )
          throw new Error('Invalid person presence');
        seen.add(key);
        return { ...person, starts, ends };
      })
      .filter((person) => active(person));
    const events = building.events ?? [];
    if (!Array.isArray(events) || events.length > 2000) throw new Error('Invalid building events');
    const parsedEvents = events
      .map((event) => {
        const starts = Date.parse(event?.startsAt),
          ends = Date.parse(event?.endsAt);
        if (
          typeof event?.id !== 'string' ||
          typeof event.title !== 'string' ||
          !event.title.trim() ||
          !Number.isFinite(starts) ||
          !Number.isFinite(ends) ||
          ends <= starts ||
          typeof event.allDay !== 'boolean' ||
          !['confirmed', 'tentative'].includes(event.status) ||
          typeof event.timeZone !== 'string'
        )
          throw new Error('Invalid building event');
        const attendees = event.attendees ?? [];
        if (
          !Array.isArray(attendees) ||
          attendees.length > 500 ||
          attendees.some(
            (person) =>
              typeof person?.id !== 'string' ||
              typeof person.displayName !== 'string' ||
              !person.displayName.trim(),
          )
        )
          throw new Error('Invalid event attendees');
        return { ...event, starts, ends, attendees };
      })
      .sort((a, b) => a.starts - b.starts);
    return { id: building.id, name: building.name, people, events: parsedEvents };
  });
}
export function parseUpcoming(value) {
  if (!Array.isArray(value) || value.length > 50000) throw new Error('Invalid upcoming plans');
  return value
    .map((plan) => {
      const starts = Date.parse(plan?.validFrom),
        ends = Date.parse(plan?.expiresAt);
      if (
        typeof plan?.personId !== 'string' ||
        typeof plan.buildingId !== 'string' ||
        typeof plan.buildingName !== 'string' ||
        typeof plan.label !== 'string' ||
        [...plan.label].length > 200 ||
        !Number.isFinite(starts) ||
        !Number.isFinite(ends) ||
        ends <= starts
      )
        throw new Error('Invalid upcoming plan');
      return { ...plan, starts, ends };
    })
    .sort((a, b) => a.starts - b.starts);
}
export function markerSignature(buildings) {
  return JSON.stringify(
    buildings
      .map((building) => [
        building.id,
        building.name,
        building.people
          .map((person) => [
            person.id,
            person.displayName,
            person.avatarUrl ?? null,
            person.status,
            person.label,
            person.starts,
            person.ends,
          ])
          .sort((a, b) => a[0].localeCompare(b[0])),
      ])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}
export function contentSignature(buildings, plans) {
  return JSON.stringify([
    markerSignature(buildings),
    buildings.map((building) => [
      building.id,
      building.name,
      building.events.map((event) => [
        event.id,
        event.title,
        event.starts,
        event.ends,
        event.allDay,
        event.status,
        event.kind ?? null,
        event.timeZone,
        event.location ?? '',
        event.url ?? null,
        event.attendees.map((person) => [person.id, person.displayName, person.avatarUrl ?? null]),
      ]),
    ]),
    plans.map((plan) => [
      plan.personId,
      plan.buildingId,
      plan.buildingName,
      plan.label,
      plan.starts,
      plan.ends,
    ]),
  ]);
}
