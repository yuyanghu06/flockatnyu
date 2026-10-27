import * as THREE from 'three';
import { campusStartup } from './map-startup.js';

import '../features/assistant/assistant.css';

import '../features/contacts/contacts.css';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { palette, initialCamera, mapExtent, cameraLimits, atmosphere } from '../map/data/config.js';
import { createMapAtmosphere } from '../map/environment/atmosphere.js';
import { createLandmarkEffects } from '../map/landmarks/landmark-effects.js';
import { createCameraFocus } from '../map/camera/camera-focus.js';
import { mapFocusLayout } from '../map/camera/map-focus-layout.js';

import { createKeyboardPan } from '../map/camera/keyboard-pan.js';

import { validateCamera, constrainPan } from '../map/landmarks/geometry.js';

import './style.css';
export function installMapScene(view) {
  view.exportCamera = function exportCamera() {
    return {
      version: 1,
      projection: 'perspective',
      position: view.camera.position.toArray(),
      target: view.controls.target.toArray(),
      fov: view.camera.fov,
      near: view.camera.near,
      far: view.camera.far,
      zoom: view.camera.zoom,
    };
  };
  view.restoreCamera = function restoreCamera(value) {
    validateCamera(value, cameraLimits);
    view.keyboardPan.reset();
    view.cameraNavigation.clearFocus();
    // Drain pending damping before applying an exact external view.
    view.controls.enableDamping = false;
    view.controls.update();
    view.camera.position.fromArray(value.position);
    view.controls.target.fromArray(value.target);
    view.camera.fov = value.fov;
    view.camera.near = value.near;
    view.camera.far = value.far;
    view.camera.zoom = value.zoom;
    view.camera.updateProjectionMatrix();
    view.controls.update();
    constrainPan(view.camera.position, view.controls.target, cameraLimits);
    view.controls.enableDamping = true;
  };
  view.resetView = function resetView() {
    view.select(null);
    view.setHovered(null);
    view.restoreCamera(initialCamera);
  };
}
export function initializeMapScene(view) {
  view.$ = (id) => document.getElementById(id);
  view.state = {
    status: 'loading',
    loaded: 0,
    failed: [],
    selected: null,
    hovered: null,
    removedColesTriangles: 0,
    startedAt: performance.now(),
    loadMilliseconds: null,
  };
  view.roots = new Map();
  view.sternBuilding = undefined;
  view.sternPlaza = undefined;
  view.scene = new THREE.Scene();
  view.mapAtmosphere = createMapAtmosphere(view.scene, palette, mapExtent, atmosphere);
  view.reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  view.landmarkEffects = createLandmarkEffects({
    scene: view.scene,
    reducedMotion: () => view.reducedMotionQuery.matches,
  });
  view.camera = new THREE.PerspectiveCamera(
    initialCamera.fov,
    innerWidth / innerHeight,
    initialCamera.near,
    initialCamera.far,
  );
  view.renderer = undefined;
  try {
    view.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    view.$('status').textContent =
      'This device could not start the 3D map. Enable WebGL and reload.';
    throw error;
  }
  view.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  view.renderer.setSize(innerWidth, innerHeight);
  view.renderer.outputColorSpace = THREE.SRGBColorSpace;
  view.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  view.renderer.toneMappingExposure = 1.25;
  view.$('map').appendChild(view.renderer.domElement);
  view.renderer.domElement.tabIndex = 0;
  view.renderer.domElement.setAttribute(
    'aria-label',
    'Campus map. Drag to orbit; right drag or WASD to pan; scroll to zoom. Click a detailed building to select it.',
  );
  view.controls = new OrbitControls(view.camera, view.renderer.domElement);
  view.controls.enabled = false;
  document.addEventListener('campus-loading-failed', () => {
    view.controls.enabled = false;
  });
  document.addEventListener(
    'campus-enter',
    () => {
      view.controls.enabled = true;
      view.renderer.domElement.focus({ preventScroll: true });
      view.lastFrame = performance.now();
      view.animate();
    },
    { once: true },
  );
  view.renderer.domElement.addEventListener('webglcontextlost', () => {
    campusStartup.fail('The graphics context was lost. Retry loading the map.');
  });
  view.renderer.debug.onShaderError = () =>
    campusStartup.fail(
      'A map shader could not compile on this device. Retry loading or try another browser.',
    );
  view.controls.enableDamping = true;
  view.controls.dampingFactor = 0.09;
  view.controls.minDistance = cameraLimits.minDistance;
  view.controls.maxDistance = cameraLimits.maxDistance;
  view.controls.minPolarAngle = cameraLimits.minPolarAngle;
  view.controls.maxPolarAngle = cameraLimits.maxPolarAngle;
  view.controls.screenSpacePanning = false;
  view.controls.zoomToCursor = true;
  view.controls.enableZoom = true;
  view.ambient = new THREE.HemisphereLight('#fff4df', '#717d72', 2.5);
  view.scene.add(view.ambient);
  view.sun = new THREE.DirectionalLight('#fff0d7', 3.2);
  view.sun.position.set(-400, 750, 300);
  view.scene.add(view.sun);
  view.ground = new THREE.Mesh(
    new THREE.PlaneGeometry(12000, 12000),
    new THREE.MeshStandardMaterial({
      color: palette.ground,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    }),
  );
  view.ground.rotation.x = -Math.PI / 2;
  view.ground.position.y = -0.12;
  view.scene.add(view.ground);
  view.mapAtmosphere.apply(view.ground);
  view.cameraNavigation = createCameraFocus({
    camera: view.camera,
    controls: view.controls,
    limits: cameraLimits,
    constrainPan,
    reducedMotion: () => view.reducedMotionQuery.matches,
    getFramingRect: () =>
      mapFocusLayout(view.$('map').clientWidth, view.$('map').clientHeight).frame,
  });
  view.keyboardPan = createKeyboardPan({
    camera: view.camera,
    controls: view.controls,
    navigation: view.cameraNavigation,
    constrainPan,
    limits: cameraLimits,
  });
}
