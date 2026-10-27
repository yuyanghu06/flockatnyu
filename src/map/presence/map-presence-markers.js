import { clampFocusedAvatarPosition } from './map-presence-drag.js';
import { resolveMapAvatarUrl } from './map-avatar-url.js';

import { portraits, initials, active, markerSignature } from './map-presence-helpers.js';

export function installMapPresenceMarkers(view) {
  view.dragDestination = function dragDestination(item, personFocused, x, y) {
    const size = item.group.sizeFactor * item.group.rect.diameter * (personFocused ? 1.5 : 1);
    const note = item.button.querySelector('.map-presence__note');
    return clampFocusedAvatarPosition({
      x,
      y,
      frame: item.group.rect,
      size,
      noteWidth: note?.offsetWidth ?? 0,
      noteHeight: note?.offsetHeight ?? 0,
    });
  };
  view.endDrag = function endDrag(settle = true) {
    if (!view.drag) return;
    const current = view.drag;
    view.drag = null;
    current.item.button.dataset.dragging = 'false';
    if (current.item.button.hasPointerCapture?.(current.pointerId))
      current.item.button.releasePointerCapture(current.pointerId);
    if (current.moved && settle && current.item.group.focused) {
      const target = view.dragDestination(
        current.item,
        current.personFocused,
        current.x,
        current.y,
      );
      current.item.dragReturning =
        Math.hypot(
          current.x - current.item.group.rect.left - target.u * current.item.group.rect.width,
          current.y - current.item.group.rect.top - target.v * current.item.group.rect.height,
        ) > 0.5;
      if (current.personFocused) current.item.personDragTarget = target;
      else current.item.focusTarget = target;
    }
  };
  view.beginDrag = function beginDrag(event, item) {
    event.stopPropagation();
    item.suppressClick = false;
    if (
      view.drag ||
      event.button !== 0 ||
      event.isPrimary === false ||
      view.getFocusedBuilding() !== item.building.id ||
      !item.group.rect?.width ||
      !item.group.rect?.height
    )
      return;
    view.drag = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenterX: item.dx,
      startCenterY: item.dy,
      x: item.dx,
      y: item.dy,
      personFocused: item.person.id === view.focusedPersonId,
      moved: false,
    };
    item.button.setPointerCapture(event.pointerId);
  };
  view.moveDrag = function moveDrag(event, item) {
    if (!view.drag || view.drag.item !== item || view.drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - view.drag.startX,
      dy = event.clientY - view.drag.startY;
    if (!view.drag.moved && Math.hypot(dx, dy) < 5) return;
    event.preventDefault();
    view.drag.moved = true;
    view.drag.x = view.drag.startCenterX + dx;
    view.drag.y = view.drag.startCenterY + dy;
    item.button.dataset.dragging = 'true';
    view.update();
  };
  view.releaseDrag = function releaseDrag(event, item) {
    if (!view.drag || view.drag.item !== item || view.drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (view.drag.moved) {
      event.preventDefault();
      item.suppressClick = true;
    }
    view.endDrag();
    view.update();
  };
  view.rebuild = function rebuild() {
    view.endDrag();
    const focused = view.groups
      .flatMap((group) => group.items)
      .find((item) => item.button === document.activeElement);
    const previousGroups = new Map(view.groups.map((group) => [group.building.id, group]));
    const previousPositions = new Map(
      view.groups.flatMap((group) =>
        group.items.map((item) => [
          `${group.building.id}:${item.person.id}`,
          {
            u: item.u,
            v: item.v,
            dx: item.dx,
            dy: item.dy,
            motionU: item.motionU,
            motionV: item.motionV,
            target: item.target,
            personScale: item.personScale,
            focusTarget: item.focusTarget,
            personDragTarget: item.personDragTarget,
            dragReturning: item.dragReturning,
          },
        ]),
      ),
    );
    view.groups.forEach((group) => group.element.remove());
    view.groups = view.source.map((building) => {
      const element = document.createElement('div');
      element.className = 'map-presence__group';
      element.dataset.buildingId = building.id;
      element.hidden = true;
      const group = {
        root: null,
        ...previousGroups.get(building.id),
        building,
        element,
        items: [],
        visible: false,
      };
      building.people.forEach((person) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-presence__person';
        button.dataset.personId = person.id;
        if (view.revealed.has(`${building.id}:${person.id}`)) button.classList.add('is-settled');
        button.setAttribute(
          'aria-label',
          [person.displayName, building.name, ...(person.label.trim() ? [person.label] : [])].join(
            ' · ',
          ),
        );
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
        const url = resolveMapAvatarUrl(person.avatarUrl, person.id, portraits);
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
        const item = {
          person,
          building,
          button,
          group,
          dx: 0,
          dy: 0,
          visible: false,
          ...previousPositions.get(`${building.id}:${person.id}`),
        };
        button.addEventListener('pointerdown', (event) => view.beginDrag(event, item));
        button.addEventListener('pointermove', (event) => view.moveDrag(event, item));
        button.addEventListener('pointerup', (event) => view.releaseDrag(event, item));
        button.addEventListener('pointercancel', (event) => view.releaseDrag(event, item));
        button.addEventListener('lostpointercapture', () => {
          if (view.drag?.item === item) {
            view.endDrag();
            view.update();
          }
        });
        button.addEventListener('dblclick', (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          if (event.detail && item.suppressClick) {
            item.suppressClick = false;
            event.preventDefault();
            return;
          }
          if (view.getFocusedBuilding() === building.id) {
            item.personDragTarget = null;
            view.focusedPersonId = view.focusedPersonId === person.id ? null : person.id;
          } else {
            view.focusedPersonId = null;
            view.selectBuilding(building.id);
            view.focusBuilding();
          }
          view.update();
        });
        group.items.push(item);
        element.append(button);
      });
      view.layer.append(element);
      return group;
    });
    if (
      view.focusedPersonId &&
      !view.groups.some((group) =>
        group.items.some((item) => item.person.id === view.focusedPersonId),
      )
    )
      view.focusedPersonId = null;
    view.update();
    const items = view.groups.flatMap((group) => group.items);
    const replacementFocus =
      focused &&
      items.find(
        (item) => item.building.id === focused.building.id && item.person.id === focused.person.id,
      );
    replacementFocus?.button.focus({ preventScroll: true });
  };
  view.expire = function expire() {
    const now = Date.now();
    if (now < view.nextMarkerExpiry && now >= view.previousWallTime) return;
    if (!view.source.some((building) => building.people.some((person) => !active(person, now))))
      return;
    view.source = view.source
      .map((building) => ({
        ...building,
        people: building.people.filter((person) => active(person, now)),
      }))
      .filter((building) => building.people.length);
    view.nextMarkerExpiry = view.source.reduce(
      (end, building) => building.people.reduce((end, person) => Math.min(end, person.ends), end),
      Infinity,
    );
    view.markerKey = markerSignature(view.source);
    view.invalidateContent();
    view.rebuild();
  };
}
