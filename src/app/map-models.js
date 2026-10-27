import * as THREE from 'three';
import { campusStartup } from './map-startup.js';

import '../features/assistant/assistant.css';

import '../features/contacts/contacts.css';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { assets, tiles } from '../map/data/assets.js';
import { buildings, palette, placements, paulson } from '../map/data/config.js';

import { compactContextGeometry, freezeStaticSubtree } from '../map/landmarks/map-resources.js';
import { removeReplacedBuilding, trimDistantGrass } from '../map/landmarks/geometry.js';
import { createPaulsonModel } from '../map/landmarks/paulson.js';
import { createLeslieElabModel, leslieElabReplacement } from '../map/landmarks/leslie-elab.js';
import { createGouldPlaza } from '../map/landmarks/gould-plaza.js';
import {
  createKimmelModel,
  removeKimmelGeometry,
  kimmelReplacement,
} from '../map/landmarks/kimmel.js';
import {
  createGlobalCenterModel,
  removeGlobalCenterGeometry,
  globalCenterReplacement,
} from '../map/landmarks/global-center.js';
import {
  createSilverCenterModel,
  silverCenterReplacement,
} from '../map/landmarks/silver-center.js';
import { enhanceCourantAsync, enhanceSternAsync } from '../map/landmarks/courant-stern.js';
import streetParkMetadata from '../../assets/campus-assets/data/streets-parks-render.json';
import './style.css';
export function installMapModels(view) {
  view.recordError = function recordError(name, error) {
    campusStartup.fail(`Could not prepare ${name}. Retry loading the campus.`);
    view.state.failed.push({ name, message: String(error.message || error) });
    view.$('errors').hidden = false;
    const li = document.createElement('li');
    li.textContent = `${name}: ${error.message || 'Unable to load model'}`;
    view.$('error-list').appendChild(li);
  };
  view.normalizeArch = function normalizeArch(model) {
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
    container.position.set(
      ring.reduce((n, p) => n + p[0], 0) / ring.length,
      0.68,
      ring.reduce((n, p) => n + p[1], 0) / ring.length,
    );
    container.rotation.y = -Math.atan2(ring[1][1] - ring[0][1], ring[1][0] - ring[0][0]);
    model.traverse((mesh) => {
      if (mesh.isMesh)
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#f1ede4',
          roughness: 0.86,
          side: THREE.DoubleSide,
        });
    });
    return container;
  };
  view.registerLandmark = function registerLandmark(id, model) {
    model.userData.buildingId = id;
    compactContextGeometry(model, view.cityMaterial);
    freezeStaticSubtree(model);
    view.registerPickMeshes(model);
    view.roots.set(id, model);
    view.landmarkEffects.register(id, model, {
      footprint:
        id === 'nyu-john-a-paulson-center'
          ? paulson.footprintMap
          : id === 'washington-square-arch'
            ? placements.washingtonSquareArch.data.footprint
            : undefined,
      footprintSpace: 'world',
    });
    view.mapAtmosphere.apply(model);
    [...view.$('building').options].find((option) => option.value === id).disabled = false;
  };
  view.loadJob = async function loadJob(job) {
    try {
      let model = job.create
        ? job.create()
        : job.name === 'nyu-john-a-paulson-center'
          ? createPaulsonModel(paulson)
          : (await view.loader.loadAsync(job.url)).scene;
      model.name = job.name;
      if (job.name === 'mapped-streets-parks') {
        view.state['mapped-streets'] = structuredClone(streetParkMetadata.streets);
        view.state['mapped-parks'] = structuredClone(streetParkMetadata.parks);
        view.state.environmentSurfaces = {
          meshes: streetParkMetadata.meshes,
          triangles: streetParkMetadata.triangles,
        };
      }
      if (job.name === 'mapped-park-vegetation') {
        // The baked scene is already in campus coordinates, with four merged meshes.
        view.state.parkVegetation = structuredClone(model.userData);
      }
      if (job.tile) {
        model.traverse((mesh) => {
          if (mesh.isMesh) mesh.material = view.cityMaterial;
        });
        if (job.name === silverCenterReplacement.tile) {
          const silver = createSilverCenterModel(model);
          view.state.removedSilverCenterTriangles = removeReplacedBuilding(
            model,
            silverCenterReplacement,
          );
          if (view.state.removedSilverCenterTriangles !== 380)
            view.recordError(
              job.name,
              new Error('Silver Center replacement geometry count needs inspection.'),
            );
          view.registerLandmark('nyu-silver-center', silver);
          view.scene.add(silver);
        }
        if (job.name === kimmelReplacement.tile) {
          const kimmel = createKimmelModel(model);
          view.state.removedKimmelTriangles = removeKimmelGeometry(model);
          if (view.state.removedKimmelTriangles !== 200)
            view.recordError(
              job.name,
              new Error('Kimmel replacement geometry count needs inspection.'),
            );
          view.registerLandmark('nyu-kimmel-center', kimmel);
          view.scene.add(kimmel);
        }
        if (job.name === leslieElabReplacement.tile) {
          const elab = createLeslieElabModel(model);
          view.state.removedLeslieTriangles = removeReplacedBuilding(model, leslieElabReplacement);
          if (view.state.removedLeslieTriangles !== 164)
            view.recordError(
              job.name,
              new Error('Leslie eLab replacement geometry count needs inspection.'),
            );
          view.registerLandmark('nyu-leslie-elab-building', elab);
          view.scene.add(elab);
        }
        if (job.name === globalCenterReplacement.tile) {
          const globalCenter = createGlobalCenterModel(model);
          view.state.removedGlobalCenterTriangles = removeGlobalCenterGeometry(model);
          if (view.state.removedGlobalCenterTriangles !== 88)
            view.recordError(
              job.name,
              new Error('Global Center replacement geometry count needs inspection.'),
            );
          view.registerLandmark('nyu-global-center', globalCenter);
          view.scene.add(globalCenter);
        }
        if (job.name === paulson.replaces.tile) {
          view.state.removedColesTriangles = removeReplacedBuilding(model, paulson.replaces);
          if (!view.state.removedColesTriangles)
            view.recordError(
              job.name,
              new Error('Old Coles geometry was not found; replacement needs inspection.'),
            );
        }
      } else {
        if (['lipton-hall', '25-union-square-west', '235-park-avenue-south'].includes(job.name)) {
          // Preserve the baked geometry, using the same pale material as city context.
          // Lipton and the Union Square buildings are ordinary, non-selectable context.
          model.traverse((mesh) => {
            if (mesh.isMesh) mesh.material = view.cityMaterial;
          });
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
        if (job.name === 'washington-square-arch') model = view.normalizeArch(model);
        if (job.name === 'park-grass') {
          view.state.removedDistantGrassTriangles = trimDistantGrass(model);
        }
        if (job.name === 'courant-institute') await enhanceCourantAsync(model);
        if (job.name === 'stern-school-of-business') await enhanceSternAsync(model);
        if (job.name === 'stern-school-of-business') view.sternBuilding = model;
        else if (job.name === 'nyu-gould-plaza') view.sternPlaza = model;
        else if (buildings.some((b) => b.id === job.name)) {
          view.registerLandmark(job.name, model);
        }
      }
      compactContextGeometry(model, view.cityMaterial);
      freezeStaticSubtree(model, { keepRootDynamic: Boolean(model.userData.buildingId) });
      view.mapAtmosphere.apply(model);
      view.scene.add(model);
      if (!model.userData.buildingId) view.registerPickMeshes(model);
      view.state.loaded++;
    } catch (error) {
      view.recordError(job.name, error);
    }
    campusStartup.jobFinished();
    view.$('status').textContent =
      `Loading campus · ${view.state.loaded + view.state.failed.length} / ${view.jobs.length} assets`;
  };
}
export function initializeMapModels(view) {
  view.loadingManager = new THREE.LoadingManager();
  view.itemStart = view.loadingManager.itemStart.bind(view.loadingManager);
  view.itemEnd = view.loadingManager.itemEnd.bind(view.loadingManager);
  view.loadingManager.itemStart = (url) => {
    campusStartup.resourceStarted();
    view.itemStart(url);
  };
  view.loadingManager.itemEnd = (url) => {
    view.itemEnd(url);
    campusStartup.resourceFinished();
  };
  view.loadingManager.onError = (url) => {
    const name =
      url.startsWith('data:') || url.startsWith('blob:')
        ? 'an embedded model resource'
        : url.split('/').pop().split('?')[0];
    campusStartup.fail(`Could not load ${name}. Check your connection and retry.`);
  };
  view.loader = new GLTFLoader(view.loadingManager);
  view.loader.setMeshoptDecoder(MeshoptDecoder);
  view.cityMaterial = new THREE.MeshStandardMaterial({
    color: palette.context,
    vertexColors: false,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  view.jobs = [
    ...tiles.map((tile) => ({ name: tile.file, url: tile.url, tile: true })),
    ...Object.entries(assets)
      .filter(([name]) => !['gould-plaza', 'park-grass'].includes(name))
      .map(([name, url]) => ({ name, url, tile: false })),
    { name: 'nyu-gould-plaza', create: createGouldPlaza },
    {
      name: 'mapped-streets-parks',
      url: new URL(
        '../../assets/campus-assets/models/environment/streets-parks.glb',
        import.meta.url,
      ).href,
    },
    {
      name: 'mapped-park-vegetation',
      url: new URL(
        '../../assets/campus-assets/models/environment/park-vegetation.glb',
        import.meta.url,
      ).href,
    },
  ];
  campusStartup.start(view.jobs.length);
}
