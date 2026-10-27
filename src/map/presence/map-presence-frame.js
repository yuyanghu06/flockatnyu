import { mapFocusLayout } from '../camera/map-focus-layout.js';

export function installMapPresenceFrame(view) {
  view.update = function update() {
    if (view.disposed) return;
    view.expire();
    view.advanceContentClock(Date.now());
    const width = view.container.clientWidth,
      height = view.container.clientHeight;
    const entered = document.getElementById('app')?.dataset.state === 'entered';
    const focusedId = view.getFocusedBuilding();
    if (focusedId !== view.focusSessionId) {
      view.endDrag(false);
      view.groups.forEach((group) =>
        group.items.forEach((item) => {
          item.focusTarget = item.personDragTarget = null;
          item.dragReturning = false;
        }),
      );
      view.focusSessionId = focusedId;
      view.focusSeed = Math.floor(Math.random() * 4294967296);
      view.focusedPersonId = null;
    }
    view.layer.dataset.personFocused = String(Boolean(view.focusedPersonId));
    view.updateItinerary();
    view.updateBuildingCard();
    if (!view.buildingCard.hidden) {
      const { card } = mapFocusLayout(width, height);
      view.buildingCard.style.left = `${card.left}px`;
      view.buildingCard.style.width = `${card.width}px`;
      view.buildingCard.style.maxHeight = `${card.maxHeight}px`;
      view.buildingCard.style.transform = 'translateY(-50%)';
      view.buildingCard.style.top = `${card.bottomAligned ? height - card.margin - view.buildingCard.offsetHeight / 2 : height / 2}px`;
    }
    let entranceIndex = 0;
    view.camera.updateMatrixWorld();
    const now = performance.now();
    const elapsed = Math.min(0.1, (now - view.previousFrame) / 1000);
    const blend = 1 - Math.exp(-elapsed * 4.5);
    const moveBlend = 1 - Math.exp(-elapsed * (4.5 / 1.3));
    view.previousFrame = now;
    for (const group of view.groups) {
      const root = view.getRoot(group.building.id);
      if (root && group.root !== root) {
        group.geometry = view.layout.prepare(root);
        group.root = root;
        group.mask = null;
      }
      const focused = focusedId === group.building.id;
      const focusWidth = Math.min(480, width * 0.44),
        focusHeight = Math.min(640, Math.max(1, height - 48));
      const rect =
        root &&
        (focused
          ? {
              left: (width * 0.44 - focusWidth) / 2,
              top: (height - focusHeight) / 2,
              width: focusWidth,
              height: focusHeight,
              diameter: 1,
            }
          : view.layout.project(group.geometry, width, height));
      if (!rect || (focusedId && !focused)) {
        group.element.hidden = true;
        group.visible = false;
        group.items.forEach((item) => {
          item.visible = false;
        });
        continue;
      }
      const changedMode = focused !== group.focused;
      if (changedMode && group.rect) {
        // Switching coordinate frames must preserve the current pixel positions
        // and diameter, so expansion/return starts exactly where portraits are.
        group.items.forEach((item) => {
          item.motionU = item.u = (item.dx - rect.left) / rect.width;
          item.motionV = item.v = (item.dy - rect.top) / rect.height;
        });
        group.renderFactor = group.pixels / rect.diameter;
      }
      if (focused) {
        if (
          changedMode ||
          group.viewportWidth !== rect.width ||
          group.viewportHeight !== rect.height ||
          group.viewportCount !== group.items.length
        ) {
          const packed = view.layout.focused(
            rect.width,
            rect.height,
            group.items.length,
            view.focusSeed,
          );
          group.sizeFactor = packed.diameter * 0.375;
          group.items.forEach((item, index) => {
            item.target = packed.points[index] ?? null;
          });
          group.viewportWidth = rect.width;
          group.viewportHeight = rect.height;
          group.viewportCount = group.items.length;
        }
      } else {
        const mask = view.layout.sample(group.geometry, rect, width, height, now);
        if (mask !== group.mask || changedMode) {
          group.mask = mask;
          const previous = group.items.map((item) =>
            changedMode
              ? { u: item.u, v: item.v }
              : (item.target ?? (item.u === undefined ? null : { u: item.u, v: item.v })),
          );
          const packed = view.layout.pack(mask, rect, group.items.length, previous);
          group.sizeFactor = packed.diameter / rect.diameter;
          group.items.forEach((item, index) => {
            item.target = packed.points[index] ?? null;
          });
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
      const positions = group.items.map((item) => {
        if (!item.target) return null;
        item.motionU ??= item.u ?? item.target.u;
        item.motionV ??= item.v ?? item.target.v;
        const personFocused = focused && item.person.id === view.focusedPersonId;
        if (view.drag?.item === item) {
          item.motionU = (view.drag.x - rect.left) / rect.width;
          item.motionV = (view.drag.y - rect.top) / rect.height;
          return { u: item.motionU, v: item.motionV };
        }
        let target = focused
          ? personFocused
            ? (item.personDragTarget ?? { u: 0.5, v: 0.5 })
            : (item.focusTarget ?? item.target)
          : item.target;
        if (focused && (personFocused ? item.personDragTarget : item.focusTarget)) {
          target = view.dragDestination(
            item,
            personFocused,
            rect.left + target.u * rect.width,
            rect.top + target.v * rect.height,
          );
          if (personFocused) item.personDragTarget = target;
          else item.focusTarget = target;
        }
        const returningBlend = view.reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed * 14);
        const positionBlend = item.dragReturning ? returningBlend : moveBlend;
        item.motionU += (target.u - item.motionU) * positionBlend;
        item.motionV += (target.v - item.motionV) * positionBlend;
        if (
          item.dragReturning &&
          Math.hypot(
            (target.u - item.motionU) * rect.width,
            (target.v - item.motionV) * rect.height,
          ) < 0.15
        ) {
          item.motionU = target.u;
          item.motionV = target.v;
          item.dragReturning = false;
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
        if (entered && !view.revealed.has(key)) {
          view.revealed.add(key);
          item.button.style.setProperty('--reveal-delay', `${entranceIndex++ * 90}ms`);
          item.button.classList.add('is-entering');
        }
        const personFocused = focused && item.person.id === view.focusedPersonId;
        item.personScale ??= 1;
        item.personScale += ((personFocused ? 1.5 : 1) - item.personScale) * blend;
        item.size = pixels * item.personScale;
        item.button.dataset.personFocused = String(personFocused);
        item.button.setAttribute('aria-pressed', String(personFocused));
        const noteScale = Math.pow(Math.max(1, group.items.length), -0.12);
        // Wrap against the destination portrait, not its growing entrance size.
        item.button.style.setProperty(
          '--note-anchor-size',
          `${rect.diameter * group.sizeFactor * (personFocused ? 1.5 : 1)}px`,
        );
        item.button.style.setProperty(
          '--note-font',
          `${16 * noteScale * (personFocused ? 1.15 : 1)}px`,
        );
        item.button.style.width = `${item.size}px`;
        item.button.style.height = `${item.size}px`;
        item.button.style.fontSize = `${item.size / 3}px`;
        item.button.style.zIndex =
          view.drag?.item === item && view.drag.moved ? '4' : personFocused ? '3' : '1';
        item.button.style.transform = `translate(${item.dx}px, ${item.dy}px) translate(-50%, -50%)`;
      });
      group.element.hidden = !group.visible;
    }
    if (!view.itinerary.hidden) {
      const person = view.groups
        .find((group) => group.building.id === view.focusSessionId)
        ?.items.find((item) => item.person.id === view.focusedPersonId);
      if (person?.visible) {
        const left = person.dx + person.size / 2 + 20;
        view.itinerary.style.left = `${left}px`;
        view.itinerary.style.width = `${Math.min(360, Math.max(0, width - left - 16))}px`;
        const halfHeight = view.itinerary.offsetHeight / 2;
        const top = Math.max(16 + halfHeight, Math.min(height - 16 - halfHeight, person.dy));
        view.itinerary.style.top = `${top}px`;
      }
    }
  };
}
