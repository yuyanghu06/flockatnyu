import * as THREE from 'three';
import { loadingScreen } from './loading-screen.js';
import { createAssistant } from './assistant.js';
import './assistant.css';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { assets, tiles } from './assets.js';
import { buildings, palette, placements, paulson, initialCamera, mapExtent, cameraLimits, atmosphere } from './config.js';
import { createMapAtmosphere } from './atmosphere.js';
import { createLandmarkEffects } from './landmark-effects.js';
import { createCameraFocus } from './camera-focus.js';
import { createMapInteractions } from './map-interactions.js';
import { compactContextGeometry, freezeStaticSubtree } from './map-resources.js';
import { removeReplacedBuilding, trimDistantGrass, validateCamera, constrainPan } from './geometry.js';
import { createPaulsonModel } from './paulson.js';
import { createLeslieElabModel, leslieElabReplacement } from './leslie-elab.js';
import { createGouldPlaza } from './gould-plaza.js';
import { createKimmelModel, removeKimmelGeometry, kimmelReplacement } from './kimmel.js';
import { createGlobalCenterModel, removeGlobalCenterGeometry, globalCenterReplacement } from './global-center.js';
import { createSilverCenterModel, silverCenterReplacement } from './silver-center.js';
import { enhanceCourant, enhanceStern } from './courant-stern.js';
import streetParkMetadata from '../campus-assets/data/streets-parks-render.json';
import './style.css';

const $ = id => document.getElementById(id);
const state = { status: 'loading', loaded: 0, failed: [], selected: null, hovered: null, removedColesTriangles: 0, startedAt: performance.now(), loadMilliseconds: null };
const roots = new Map();
const scene = new THREE.Scene();
const mapAtmosphere = createMapAtmosphere(scene,palette,mapExtent,atmosphere);
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const landmarkEffects = createLandmarkEffects({ scene, reducedMotion: () => reducedMotionQuery.matches });
const camera = new THREE.PerspectiveCamera(initialCamera.fov, innerWidth / innerHeight, initialCamera.near, initialCamera.far);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  $('status').textContent = 'This device could not start the 3D map. Enable WebGL and reload.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
$('map').appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Campus map. Drag to orbit; right drag to pan; scroll to zoom. Click a detailed building to select it.');
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
document.addEventListener('campus-loading-failed', () => { controls.enabled = false; });
document.addEventListener('campus-enter', () => {
  controls.enabled = true;
  renderer.domElement.focus({ preventScroll: true });
  lastFrame = performance.now();
  animate();
}, { once: true });
renderer.domElement.addEventListener('webglcontextlost', () => {
  loadingScreen.fail('The graphics context was lost. Retry loading the map.');
});
renderer.debug.onShaderError = () => loadingScreen.fail('A map shader could not compile on this device. Retry loading or try another browser.');
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = cameraLimits.minDistance;
controls.maxDistance = cameraLimits.maxDistance;
controls.minPolarAngle = cameraLimits.minPolarAngle;
controls.maxPolarAngle = cameraLimits.maxPolarAngle;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.enableZoom = true; // Native pinch stays enabled; the capture wheel handler owns mouse/trackpad zoom.
const ambient = new THREE.HemisphereLight('#fff4df', '#717d72', 2.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff0d7', 3.2);
sun.position.set(-400, 750, 300);
scene.add(sun);
// Push only the background ground plane back in depth. At wide zoom, its 14cm
// gap below asphalt can otherwise quantize to the same depth during camera motion.
// Keep the normal depth pipeline for architecture and its existing roof details.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.12;
scene.add(ground);
mapAtmosphere.apply(ground);
const cameraNavigation = createCameraFocus({ camera, controls, limits: cameraLimits, constrainPan, reducedMotion: () => reducedMotionQuery.matches });

function exportCamera() {
  return { version: 1, projection: 'perspective', position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom };
}
function restoreCamera(value) {
  validateCamera(value, cameraLimits);
  cameraNavigation.clearFocus();
  // Drain pending damping before applying an exact external view.
  controls.enableDamping = false;
  controls.update();
  camera.position.fromArray(value.position);
  controls.target.fromArray(value.target);
  camera.fov = value.fov;
  camera.near = value.near;
  camera.far = value.far;
  camera.zoom = value.zoom;
  camera.updateProjectionMatrix();
  controls.update();
  constrainPan(camera.position, controls.target, cameraLimits);
  controls.enableDamping = true;
}
restoreCamera(initialCamera);
function resetView() {
  select(null);
  setHovered(null);
  restoreCamera(initialCamera);
}
$('reset').addEventListener('click', resetView);
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

for (const building of buildings) {
  const option = document.createElement('option');
  option.value = building.id;
  option.textContent = building.name;
  option.disabled = true;
  $('building').appendChild(option);
}
$('date').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function repaint() {
  landmarkEffects.setActive(state.hovered,state.selected);
}
function select(id) {
  if (id && !roots.has(id)) return;
  state.selected = id || null;
  document.dispatchEvent(new CustomEvent('campus-building-selected', { detail: { id: state.selected, name: buildings.find(building => building.id === state.selected)?.name ?? null } }));
  if (!id) cameraNavigation.leaveFocus();
  $('building').value = id || '';
  $('building-detail').hidden = !id;
  if (id) {
    const data = buildings.find(b => b.id === id);
    $('building-name').textContent = data.name;
    $('building-description').textContent = data.description;
  }
  repaint();
}
$('building').addEventListener('change', event => select(event.target.value));
$('clear').addEventListener('click', () => select(null));
function focusSelection() {
  const root = roots.get(state.selected);
  if (root) cameraNavigation.focus(root,state.selected);
}
$('focus').addEventListener('click', focusSelection);

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const pickMeshes = [], pickHits = [];
// Register scene meshes once; keep context occluders, omit decorative glow/sky.
function registerPickMeshes(root) {
  root.traverse(object => {
    if (!object.isMesh || object.userData.mapDecoration) return;
    object.geometry.computeBoundingBox();
    pickMeshes.push(object);
  });
}
registerPickMeshes(ground);
function hit(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // Include context geometry so a building behind another cannot be selected.
  pickHits.length = 0;
  const hits = raycaster.intersectObjects(pickMeshes, false, pickHits);
  if (!hits.length) return null;
  let object = hits[0].object;
  while (object) {
    if (object.userData.buildingId) return object.userData.buildingId;
    object = object.parent;
  }
  return null;
}
function setHovered(id) {
  if (id !== state.hovered) { state.hovered = id; repaint(); }
  renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
}
const mapInteractions = createMapInteractions({ element: renderer.domElement, controls, hit, select, setHovered, navigation: cameraNavigation, getRoot: id => roots.get(id) });
createAssistant({ getBuilding: () => { const building = buildings.find(item => item.id === state.selected); return building ? { id: building.id, name: building.name } : null; } });

$('camera-open').addEventListener('click', () => {
  $('camera-json').value = JSON.stringify(exportCamera(), null, 2);
  $('camera-message').textContent = '';
  $('camera-dialog').showModal();
});
$('camera-copy').addEventListener('click', async () => {
  const json = JSON.stringify(exportCamera(), null, 2);
  $('camera-json').value = json;
  try {
    await navigator.clipboard.writeText(json);
    $('camera-message').textContent = 'Camera copied. Send this JSON with your feedback.';
  } catch {
    $('camera-json').focus();
    $('camera-json').select();
    $('camera-message').textContent = 'Clipboard unavailable. Copy the selected JSON manually.';
  }
});
$('camera-restore').addEventListener('click', () => {
  try {
    restoreCamera(JSON.parse($('camera-json').value));
    $('camera-message').textContent = 'Saved angle restored.';
  } catch (error) { $('camera-message').textContent = `Could not restore: ${error.message}`; }
});

const loadingManager = new THREE.LoadingManager();
const itemStart = loadingManager.itemStart.bind(loadingManager);
const itemEnd = loadingManager.itemEnd.bind(loadingManager);
loadingManager.itemStart = url => { loadingScreen.resourceStarted(); itemStart(url); };
loadingManager.itemEnd = url => { itemEnd(url); loadingScreen.resourceFinished(); };
loadingManager.onError = url => {
  const name = url.startsWith('data:') || url.startsWith('blob:') ? 'an embedded model resource' : url.split('/').pop().split('?')[0];
  loadingScreen.fail(`Could not load ${name}. Check your connection and retry.`);
};
const loader = new GLTFLoader(loadingManager);
loader.setMeshoptDecoder(MeshoptDecoder);
const cityMaterial = new THREE.MeshStandardMaterial({ color: palette.context, vertexColors: false, roughness: 1, side: THREE.DoubleSide });
const jobs = [
  ...tiles.map(tile => ({ name: tile.file, url: tile.url, tile: true })),
  ...Object.entries(assets).filter(([name]) => !['gould-plaza','park-grass'].includes(name)).map(([name, url]) => ({ name, url, tile: false })),
  { name: 'nyu-gould-plaza', create: createGouldPlaza },
  { name: 'mapped-streets-parks', url: new URL('../campus-assets/models/environment/streets-parks.glb', import.meta.url).href },
  { name: 'mapped-park-vegetation', url: new URL('../campus-assets/models/environment/park-vegetation.glb', import.meta.url).href },
];
loadingScreen.start(jobs.length);
function recordError(name, error) {
  loadingScreen.fail(`Could not prepare ${name}. Retry loading the campus.`);
  state.failed.push({ name, message: String(error.message || error) });
  $('errors').hidden = false;
  const li = document.createElement('li');
  li.textContent = `${name}: ${error.message || 'Unable to load model'}`;
  $('error-list').appendChild(li);
}
function normalizeArch(model) {
  const data = placements.washingtonSquareArch.data;
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = data.height / (bounds.max.y - bounds.min.y);
  const normalized = new THREE.Group();
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  normalized.add(model);
  normalized.scale.setScalar(scale);
  const container = new THREE.Group();
  container.add(normalized);
  const ring = data.footprint.slice(0, -1);
  container.position.set(ring.reduce((n, p) => n + p[0], 0) / ring.length, 0.68, ring.reduce((n, p) => n + p[1], 0) / ring.length);
  container.rotation.y = -Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0]);
  model.traverse(mesh => { if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.86, side: THREE.DoubleSide }); });
  return container;
}
function registerLandmark(id, model) {
  model.userData.buildingId = id;
  compactContextGeometry(model, cityMaterial);
  freezeStaticSubtree(model);
  registerPickMeshes(model);
  roots.set(id, model);
  landmarkEffects.register(id,model);
  mapAtmosphere.apply(model);
  [...$('building').options].find(option => option.value === id).disabled = false;
}
async function loadJob(job) {
  try {
    let model = job.create ? job.create() : job.name === 'nyu-john-a-paulson-center' ? createPaulsonModel(paulson) : (await loader.loadAsync(job.url)).scene;
    model.name = job.name;
    if (job.name === 'mapped-streets-parks') {
      state['mapped-streets'] = structuredClone(streetParkMetadata.streets);
      state['mapped-parks'] = structuredClone(streetParkMetadata.parks);
      state.environmentSurfaces = { meshes: streetParkMetadata.meshes, triangles: streetParkMetadata.triangles };
    }
    if (job.name === 'mapped-park-vegetation') {
      // The baked scene is already in campus coordinates, with four merged meshes.
      state.parkVegetation = structuredClone(model.userData);
    }
    if (job.tile) {
      model.traverse(mesh => { if (mesh.isMesh) mesh.material = cityMaterial; });
      if (job.name === silverCenterReplacement.tile) {
        const silver = createSilverCenterModel(model);
        state.removedSilverCenterTriangles = removeReplacedBuilding(model, silverCenterReplacement);
        if (state.removedSilverCenterTriangles !== 380) recordError(job.name, new Error('Silver Center replacement geometry count needs inspection.'));
        registerLandmark('nyu-silver-center', silver);
        scene.add(silver);
      }
      if (job.name === kimmelReplacement.tile) {
        const kimmel = createKimmelModel(model);
        state.removedKimmelTriangles = removeKimmelGeometry(model);
        if (state.removedKimmelTriangles !== 200) recordError(job.name, new Error('Kimmel replacement geometry count needs inspection.'));
        registerLandmark('nyu-kimmel-center', kimmel);
        scene.add(kimmel);
      }
      if (job.name === leslieElabReplacement.tile) {
        const elab = createLeslieElabModel(model);
        state.removedLeslieTriangles = removeReplacedBuilding(model, leslieElabReplacement);
        if (state.removedLeslieTriangles !== 164) recordError(job.name, new Error('Leslie eLab replacement geometry count needs inspection.'));
        registerLandmark('nyu-leslie-elab-building', elab);
        scene.add(elab);
      }
      if (job.name === globalCenterReplacement.tile) {
        const globalCenter = createGlobalCenterModel(model);
        state.removedGlobalCenterTriangles = removeGlobalCenterGeometry(model);
        if (state.removedGlobalCenterTriangles !== 88) recordError(job.name, new Error('Global Center replacement geometry count needs inspection.'));
        registerLandmark('nyu-global-center', globalCenter);
        scene.add(globalCenter);
      }
      if (job.name === paulson.replaces.tile) {
        state.removedColesTriangles = removeReplacedBuilding(model, paulson.replaces);
        if (!state.removedColesTriangles) recordError(job.name, new Error('Old Coles geometry was not found; replacement needs inspection.'));
      }
    } else {
      if (['lipton-hall','25-union-square-west','235-park-avenue-south'].includes(job.name)) {
        // Preserve the baked geometry, using the same pale material as city context.
        // Lipton remains selectable; Union Square buildings remain ordinary context.
        model.traverse(mesh => { if (mesh.isMesh) mesh.material = cityMaterial; });
      }
      if (job.name === 'bobst-library') {
        const transform = placements.bobstLibrary;
        const container = new THREE.Group();
        container.add(model);
        container.position.fromArray(transform.position);
        container.scale.fromArray(transform.scale);
        container.rotation.y = transform.rotationY;
        model = container;
      }
      if (job.name === 'washington-square-arch') model = normalizeArch(model);
      if (job.name === 'park-grass') {
        state.removedDistantGrassTriangles = trimDistantGrass(model);
      }
      if (job.name === 'courant-institute') enhanceCourant(model);
      if (job.name === 'stern-school-of-business') enhanceStern(model);
      if (buildings.some(b => b.id === job.name)) {
        registerLandmark(job.name, model);
      }
    }
    compactContextGeometry(model, cityMaterial);
    freezeStaticSubtree(model, { keepRootDynamic: Boolean(model.userData.buildingId) });
    mapAtmosphere.apply(model);
    scene.add(model);
    if (!model.userData.buildingId) registerPickMeshes(model);
    state.loaded++;
  } catch (error) { recordError(job.name, error); }
  loadingScreen.jobFinished();
  $('status').textContent = `Loading campus · ${state.loaded + state.failed.length} / ${jobs.length} assets`;
}
// Bound concurrent decoding/network work while keeping the initial view responsive.
let nextJob = 0;
let lastFrame = performance.now();
const frameIntervals = new Float32Array(300), frameCpu = new Float32Array(300);
let frameSamples = 0;
function performanceSnapshot() {
  const count = Math.min(frameSamples, frameIntervals.length);
  const summarize = values => {
    const sorted = Array.from(values.subarray(0, count)).sort((a,b) => a-b);
    const percentile = p => sorted[Math.max(0, Math.ceil(count*p)-1)] ?? null;
    return { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) };
  };
  return { samples: count, frameIntervalMs: summarize(frameIntervals), mainThreadFrameMs: summarize(frameCpu),
    resources: { ...renderer.info.memory }, programs: renderer.info.programs?.length,
    note: 'Rolling 300 frames; CPU timing excludes asynchronous GPU execution. Resource counts are not bytes.' };
}
function animate() {
  const now = performance.now();
  const elapsedSeconds = Math.max(0,(now-lastFrame)/1000);
  const delta = Math.min(elapsedSeconds,.1);
  landmarkEffects.update(delta,now/1000);
  lastFrame = now;
  controls.update();
  cameraNavigation.update(elapsedSeconds);
  constrainPan(camera.position, controls.target, cameraLimits);
  mapInteractions.update(delta);
  renderer.render(scene, camera);
  const sample = frameSamples++ % frameIntervals.length;
  frameIntervals[sample] = elapsedSeconds * 1000;
  frameCpu[sample] = performance.now() - now;
  requestAnimationFrame(animate);
}
await Promise.all(Array.from({ length: 5 }, async () => {
  while (nextJob < jobs.length) await loadJob(jobs[nextJob++]);
}));
if (!state.failed.length && loadingScreen.snapshot().status !== 'failed') {
  // Await shader preparation, upload/draw the complete scene, then allow a
  // presentation frame beneath the still-opaque screen before exposing Enter.
  scene.updateMatrixWorld(true);
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  loadingScreen.sceneReady();
}
state.status = state.failed.length || loadingScreen.snapshot().status === 'failed' ? 'partial' : 'ready';
state.loadMilliseconds = Math.round(performance.now() - state.startedAt);
$('status').textContent = state.failed.length ? `Campus partially loaded · ${state.failed.length} issue(s)` : `${roots.size} landmarks · Washington Square campus`;

function project(id) {
  const root = roots.get(id);
  if (!root) return null;
  const point = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3()).project(camera);
  return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2, visible: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1 };
}
function landmarkSnapshot(id, root) {
  const box = new THREE.Box3().setFromObject(root);
  let meshes = 0;
  let triangles = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.mapDecoration) return;
    meshes++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  });
  return { id, bounds: { min: box.min.toArray(), max: box.max.toArray() }, screen: project(id), meshes, triangles, details: structuredClone(root.userData) };
}
Object.defineProperty(window, '__map', { value: Object.freeze({
  snapshot: () => ({ ...structuredClone(state), camera: exportCamera(), navigation: { mapExtent: { ...mapExtent }, cameraLimits: structuredClone(cameraLimits), loadedTileCount: tiles.length }, render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, logarithmicDepthBuffer: renderer.capabilities.logarithmicDepthBuffer }, landmarks: [...roots].map(([id, root]) => landmarkSnapshot(id, root)) }),
  performance: performanceSnapshot,
  project,
  select,
  focus: focusSelection,
  restoreCamera,
  reset: resetView,
}), writable: false });
