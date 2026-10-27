import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { enhanceCourantAsync, enhanceSternAsync } from '../src/map/landmarks/courant-stern.js';
import { createLeslieElabModel, leslieElabReplacement } from '../src/map/landmarks/leslie-elab.js';
import { removeReplacedBuilding, insideFootprint } from '../src/map/landmarks/geometry.js';

const asset = path => new URL('../assets/' + path, import.meta.url);
const json = async path => JSON.parse(await readFile(asset(path), 'utf8'));
async function load(path) {
  const bytes = await readFile(asset(path));
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const hash = data => createHash('sha256').update(data).digest('hex');
function meshHash(mesh) {
  const geometry = mesh.geometry;
  const buffers = Object.entries(geometry.attributes).map(([name, a]) =>
    [name, a.itemSize, a.normalized, hash(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength))]);
  if (geometry.index) buffers.push(['index', hash(Buffer.from(geometry.index.array.buffer,
    geometry.index.array.byteOffset, geometry.index.array.byteLength))]);
  return hash(JSON.stringify({ buffers, material: mesh.material.toJSON(), matrix: mesh.matrix.toArray() }));
}

test('Courant and Stern details preserve original GLB meshes and use their source colors', async () => {
  for (const [id, enhance] of [['courant-institute', enhanceCourantAsync], ['stern-school-of-business', enhanceSternAsync]]) {
    const root = await load(`yuyang-site-3d-assets/models/buildings/${id}.glb`);
    const originals = new Map(), palette = new Map();
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      originals.set(mesh, meshHash(mesh));
      const colors = mesh.geometry.attributes.color;
      for (let i = 0; i < (colors?.count ?? 0); i++) {
        const rgb = [colors.getX(i), colors.getY(i), colors.getZ(i)];
        palette.set(rgb.join(','), rgb);
      }
    });
    await enhance(root);
    let added = 0;
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (originals.has(mesh)) assert.equal(meshHash(mesh), originals.get(mesh), id);
      else {
        added++;
        const color = mesh.material.color.toArray();
        assert([...palette.values()].some(rgb => rgb.every((n, i) => Math.abs(n - color[i]) < 1e-6)), id);
      }
    });
    for (const mesh of originals.keys()) assert(root.getObjectById(mesh.id), `${id}: original mesh retained`);
    assert(added > 0, `${id}: details were actually added`);
  }
});

test('baked streets and parks stay finite, aligned with source coordinates and clear of the fountain', async () => {
  const data = await json('campus-assets/data/streets-parks.json');
  const placements = await json('yuyang-site-3d-assets/data/landmark-placements.json');
  const { projection, extent } = data.metadata;
  assert(data.roads.length > 0 && data.parks.length > 0);
  assert.deepEqual(data.metadata.unresolvedRings, []);
  for (const node of Object.values(data.nodes)) {
    const expected = [(node.lon - projection.originLongitude) * projection.metersPerDegreeLongitude,
      (projection.originLatitude - node.lat) * projection.metersPerDegreeLatitude];
    expected.forEach((n, i) => assert(Math.abs(n - node.point[i]) < .000051, 'source projection'));
  }
  const points = Object.values(data.nodes).map(node => node.point);
  for (const [x, z] of placements.washingtonSquareArch.data.footprint) {
    assert(points.some(p => Math.hypot(p[0] - x, p[1] - z) < .001), 'arch anchors share the map origin');
  }
  const root = await load('campus-assets/models/environment/streets-parks.glb');
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  assert(bounds.min.x >= extent.minX - .002 && bounds.max.x <= extent.maxX + .002);
  assert(bounds.min.z >= extent.minZ - .002 && bounds.max.z <= extent.maxZ + .002);
  let meshes = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    meshes++;
    for (const n of mesh.geometry.attributes.position.array) assert(Number.isFinite(n));
  });
  assert(meshes > 0);
  const ray = new THREE.Raycaster(new THREE.Vector3(-10.26195, 10, -.3117), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(root, true).length, 0, 'existing fountain center remains open');
});

function triangles(root) {
  root.updateMatrixWorld(true);
  const result = [];
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      result.push([0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p,
        index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld).toArray()));
    }
  });
  return result;
}
test('Leslie extraction leaves its source tile intact and replacement preserves every neighboring triangle', async () => {
  const tile = await load('yuyang-site-3d-assets/models/buildings/city-tiles/tile-0_0.glb');
  const before = triangles(tile), originalHashes = new Map();
  tile.traverse(mesh => { if (mesh.isMesh) originalHashes.set(mesh, meshHash(mesh)); });
  const model = createLeslieElabModel(tile);
  tile.traverse(mesh => { if (mesh.isMesh) assert.equal(meshHash(mesh), originalHashes.get(mesh)); });
  assert(triangles(model).length > 0);
  const replacement = leslieElabReplacement;
  const isHost = triangle => triangle.every(([x, y, z]) => insideFootprint(x, z, replacement.footprint)
    && y >= replacement.datasetHeightRange[0] - .1 && y <= replacement.datasetHeightRange[1] + .1);
  const expectedNeighbors = before.filter(triangle => !isHost(triangle));
  const removed = removeReplacedBuilding(tile, replacement);
  assert.equal(removed, 164, 'recorded Leslie host geometry');
  assert(removed > 0 && removed < before.length, 'only the host building is removed');
  assert.equal(removed, before.length - expectedNeighbors.length);
  assert.deepEqual(triangles(tile), expectedNeighbors);
});

test('Paulson replacement removes the connected Coles shell and keeps surrounding source buildings', async () => {
  const metadata = (await json('campus-assets/data/extracted-buildings.json')).buildings['nyu-john-a-paulson-center'];
  const tile = await load('yuyang-site-3d-assets/models/buildings/city-tiles/' + metadata.replaces.tile);
  const before = triangles(tile), parents = before.map((_, i) => i), owners = new Map();
  const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  before.forEach((triangle, i) => triangle.forEach(point => {
    const key = point.map(n => n.toFixed(4)).join(',');
    if (owners.has(key)) parents[root(i)] = root(owners.get(key));
    else owners.set(key, i);
  }));
  const components = new Map();
  before.forEach((triangle, i) => {
    const id = root(i);
    if (!components.has(id)) components.set(id, []);
    components.get(id).push(triangle);
  });
  // Independently locate the connected source shell by its center, rather than
  // duplicating the application's per-vertex replacement predicate.
  const polygon = metadata.replaces.footprint;
  const contains = (x, z) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, az] = polygon[i], [bx, bz] = polygon[j];
      if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
  };
  const shells = [...components.values()].filter(component => component.some(triangle =>
    contains(triangle.reduce((n, p) => n + p[0], 0) / 3, triangle.reduce((n, p) => n + p[2], 0) / 3)));
  // Quantized roofs and walls can have small seams, so the building may consist
  // of several connected shells. All of its recorded 92 triangles must be removed.
  assert.equal(shells.flat().length, 92, 'recorded Coles source geometry');
  const removed = new Set(shells.flat().map(triangle => JSON.stringify(triangle)));
  assert.equal(removeReplacedBuilding(tile, metadata.replaces), removed.size);
  assert.deepEqual(triangles(tile), before.filter(triangle => !removed.has(JSON.stringify(triangle))));
});
