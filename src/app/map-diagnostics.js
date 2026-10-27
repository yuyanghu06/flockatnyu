import * as THREE from 'three';

import '../features/assistant/assistant.css';

import '../features/contacts/contacts.css';

import { tiles } from '../map/data/assets.js';
import { mapExtent, cameraLimits } from '../map/data/config.js';

import './style.css';
export function installMapDiagnostics(view) {
  view.project = function project(id) {
    const root = view.roots.get(id);
    if (!root) return null;
    const point = new THREE.Box3()
      .setFromObject(root)
      .getCenter(new THREE.Vector3())
      .project(view.camera);
    return {
      x: ((point.x + 1) * innerWidth) / 2,
      y: ((1 - point.y) * innerHeight) / 2,
      visible: Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1,
    };
  };
  view.landmarkSnapshot = function landmarkSnapshot(id, root) {
    const box = new THREE.Box3().setFromObject(root);
    let meshes = 0;
    let triangles = 0;
    root.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.mapDecoration) return;
      meshes++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    });
    const parts = root.userData.includesGouldPlaza
      ? root.children.map((part) => {
          const bounds = new THREE.Box3().setFromObject(part);
          return {
            name: part.name,
            bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
          };
        })
      : undefined;
    return {
      id,
      bounds: { min: box.min.toArray(), max: box.max.toArray() },
      screen: view.project(id),
      meshes,
      triangles,
      details: structuredClone(root.userData),
      parts,
    };
  };
}
export function exposeMapDiagnostics(view) {
  Object.defineProperty(window, '__map', {
    value: Object.freeze({
      snapshot: () => ({
        ...structuredClone(view.state),
        camera: view.exportCamera(),
        navigation: {
          mapExtent: { ...mapExtent },
          cameraLimits: structuredClone(cameraLimits),
          loadedTileCount: tiles.length,
        },
        render: {
          calls: view.renderer.info.render.calls,
          triangles: view.renderer.info.render.triangles,
          logarithmicDepthBuffer: view.renderer.capabilities.logarithmicDepthBuffer,
        },
        landmarks: [...view.roots].map(([id, root]) => view.landmarkSnapshot(id, root)),
      }),
      performance: view.performanceSnapshot,
      presence: Object.freeze({
        refresh: view.mapPresence.refresh,
        snapshot: view.mapPresence.snapshot,
      }),
      eventIndicators: Object.freeze({ snapshot: view.eventIndicators.snapshot }),
      project: view.project,
      select: view.select,
      focus: view.focusSelection,
      restoreCamera: view.restoreCamera,
      reset: view.resetView,
    }),
    writable: false,
  });
}
