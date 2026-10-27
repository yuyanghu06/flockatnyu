import * as THREE from 'three';
import { campusStartup } from './map-startup.js';
import { createAssistant } from '../features/assistant/assistant.js';
import '../features/assistant/assistant.css';
import { createContacts } from '../features/contacts/contacts.js';
import '../features/contacts/contacts.css';

import { buildings, initialCamera } from '../map/data/config.js';

import { createMapInteractions } from '../map/camera/map-interactions.js';

import { createMapPresence } from '../map/presence/map-presence.js';
import { createMapEventIndicators } from '../map/presence/map-event-indicators.js';

import './style.css';
import { installMapScene, initializeMapScene } from './map-scene.js';
import { installMapModels, initializeMapModels } from './map-models.js';
import { installMapFrame, initializeMapFrame } from './map-frame.js';
import { installMapDiagnostics, exposeMapDiagnostics } from './map-diagnostics.js';
const view = {};
installMapScene(view);
installMapModels(view);
installMapFrame(view);
installMapDiagnostics(view);
initializeMapScene(view);
view.restoreCamera(initialCamera);
view.$('reset').addEventListener('click', view.resetView);
window.addEventListener('resize', () => {
  view.camera.aspect = innerWidth / innerHeight;
  view.camera.updateProjectionMatrix();
  view.renderer.setSize(innerWidth, innerHeight);
  view.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
for (const building of buildings) {
  const option = document.createElement('option');
  option.value = building.id;
  option.textContent = building.name;
  option.disabled = true;
  view.$('building').appendChild(option);
}
view.$('date').value = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
view.repaint = function repaint() {
  view.landmarkEffects.setActive(view.state.hovered, view.state.selected);
};
view.select = function select(id) {
  if (id && !view.roots.has(id)) return;
  view.state.selected = id || null;
  document.dispatchEvent(
    new CustomEvent('campus-building-selected', {
      detail: {
        id: view.state.selected,
        name: buildings.find((building) => building.id === view.state.selected)?.name ?? null,
      },
    }),
  );
  if (!id) view.cameraNavigation.leaveFocus();
  view.$('building').value = id || '';
  view.$('building-detail').hidden = !id;
  if (id) {
    const data = buildings.find((b) => b.id === id);
    view.$('building-name').textContent = data.name;
    view.$('building-description').textContent = data.description;
  }
  view.repaint();
};
view.$('building').addEventListener('change', (event) => view.select(event.target.value));
view.$('clear').addEventListener('click', () => view.select(null));
view.focusSelection = function focusSelection() {
  const root = view.roots.get(view.state.selected);
  if (root) {
    view.keyboardPan.reset();
    view.cameraNavigation.focus(root, view.state.selected);
  }
};
view.$('focus').addEventListener('click', view.focusSelection);
view.pointer = new THREE.Vector2();
view.raycaster = new THREE.Raycaster();
view.pickMeshes = [];
view.pickHits = [];
view.pickMeshSet = new Set();
view.registerPickMeshes = function registerPickMeshes(root) {
  root.traverse((object) => {
    if (!object.isMesh || object.userData.mapDecoration || view.pickMeshSet.has(object)) return;
    view.pickMeshSet.add(object);
    object.geometry.computeBoundingBox();
    view.pickMeshes.push(object);
  });
};
view.registerPickMeshes(view.ground);
view.hit = function hit(event) {
  const rect = view.renderer.domElement.getBoundingClientRect();
  view.pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    (-(event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  view.raycaster.setFromCamera(view.pointer, view.camera);
  // Include context geometry so a building behind another cannot be selected.
  view.pickHits.length = 0;
  const hits = view.raycaster.intersectObjects(view.pickMeshes, false, view.pickHits);
  if (!hits.length) return null;
  let object = hits[0].object;
  while (object) {
    if (object.userData.buildingId) return object.userData.buildingId;
    object = object.parent;
  }
  return null;
};
view.setHovered = function setHovered(id) {
  if (id !== view.state.hovered) {
    view.state.hovered = id;
    view.repaint();
  }
  view.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
};
view.mapInteractions = createMapInteractions({
  element: view.renderer.domElement,
  wheelEventTarget: window,
  controls: view.controls,
  hit: view.hit,
  select: view.select,
  setHovered: view.setHovered,
  navigation: view.cameraNavigation,
  getRoot: (id) => view.roots.get(id),
  isWheelEnabled: () =>
    view.controls.enabled &&
    !document.querySelector('dialog[open]') &&
    !document.querySelector('.map-presence__itinerary:hover'),
});
view.contactsUi = createContacts({
  onFlockContact: (contact) => view.assistantUi.attachContact(contact),
});
view.assistantUi = createAssistant({
  extraLaunchers: [view.contactsUi.launcher],
  getBuilding: () => {
    const building = buildings.find((item) => item.id === view.state.selected);
    return building ? { id: building.id, name: building.name } : null;
  },
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    view.contactsUi.dispose();
    view.assistantUi.dispose();
  });
view.eventIndicators = createMapEventIndicators({
  scene: view.scene,
  camera: view.camera,
  getRoot: (id) => view.roots.get(id),
  reducedMotion: () => view.reducedMotionQuery.matches,
});
view.mapPresence = createMapPresence({
  container: view.$('map'),
  camera: view.camera,
  renderer: view.renderer,
  getRoot: (id) => view.roots.get(id),
  selectBuilding: view.select,
  focusBuilding: view.focusSelection,
  getFocusedBuilding: () =>
    view.cameraNavigation.returning ? null : view.cameraNavigation.focusedId,
  onCatalogueChange: (catalogue) => view.eventIndicators.setBuildings(catalogue),
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    view.mapPresence.dispose();
    view.eventIndicators.dispose();
  });
view.$('camera-open').addEventListener('click', () => {
  view.$('camera-json').value = JSON.stringify(view.exportCamera(), null, 2);
  view.$('camera-message').textContent = '';
  view.$('camera-dialog').showModal();
});
view.$('camera-copy').addEventListener('click', async () => {
  const json = JSON.stringify(view.exportCamera(), null, 2);
  view.$('camera-json').value = json;
  try {
    await navigator.clipboard.writeText(json);
    view.$('camera-message').textContent = 'Camera copied. Send this JSON with your feedback.';
  } catch {
    view.$('camera-json').focus();
    view.$('camera-json').select();
    view.$('camera-message').textContent =
      'Clipboard unavailable. Copy the selected JSON manually.';
  }
});
view.$('camera-restore').addEventListener('click', () => {
  try {
    view.restoreCamera(JSON.parse(view.$('camera-json').value));
    view.$('camera-message').textContent = 'Saved angle restored.';
  } catch (error) {
    view.$('camera-message').textContent = `Could not restore: ${error.message}`;
  }
});
initializeMapModels(view);
view.nextJob = 0;
initializeMapFrame(view);
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (view.nextJob < view.jobs.length) await view.loadJob(view.jobs[view.nextJob++]);
  }),
);
if (view.sternBuilding && view.sternPlaza) {
  const stern = new THREE.Group();
  stern.name = 'Stern School of Business and Gould Plaza';
  stern.userData = {
    ...view.sternBuilding.userData,
    includesGouldPlaza: true,
    plaza: structuredClone(view.sternPlaza.userData),
  };
  stern.add(view.sternBuilding, view.sternPlaza);
  view.registerLandmark('stern-school-of-business', stern);
  view.scene.add(stern);
}
if (!view.state.failed.length && campusStartup.snapshot().status !== 'failed') {
  // Await shader preparation, upload/draw the complete scene, then allow a
  // presentation frame before automatically enabling map navigation.
  view.scene.updateMatrixWorld(true);
  await view.renderer.compileAsync(view.scene, view.camera);
  view.renderer.render(view.scene, view.camera);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  campusStartup.sceneReady();
}
view.state.status =
  view.state.failed.length || campusStartup.snapshot().status === 'failed' ? 'partial' : 'ready';
view.state.loadMilliseconds = Math.round(performance.now() - view.state.startedAt);
view.$('status').textContent = view.state.failed.length
  ? `Campus partially loaded · ${view.state.failed.length} issue(s)`
  : `${view.roots.size} landmarks · Washington Square campus`;
exposeMapDiagnostics(view);
