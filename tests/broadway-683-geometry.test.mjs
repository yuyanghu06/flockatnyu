import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { createBroadway683Model, broadway683Replacement } from '../src/broadway-683.js';
import { removeReplacedBuilding } from '../src/geometry.js';

const file = 'assets/yuyang-site-3d-assets/models/buildings/city-tiles/tile-1_1.glb';
const out = 'evidence/683-broadway';
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const initialBytes = fs.readFileSync(file), sourceHash = digest(initialBytes);
const polygon = [[197.257,295.714],[218.816,309.494],[214.773,315.818],[214.635,316.035],[210.817,322.008],[210.503,322.499],[210.191,322.299],[197.801,314.38],[189.285,308.936],[185.837,306.732],[186.271,306.053],[188.592,302.421],[190.317,299.722],[193.296,301.627],[193.43,301.702]];
// Independent implementation of the geometric contract, separate from runtime
// insideFootprint. Concave polygon and inclusive edge tolerance are essential.
function inside(x, z) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j], [bx, bz] = polygon[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) <= .08) return true;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) result = !result;
  } return result;
}
const targeted = t => t.every(([x, y, z]) => inside(x, z) && y >= 4.048 && y <= 59.708);
const key = t => t.map(p => p.map(v => Math.round(v * 100)).join(',')).sort().join('|');
function meshes(root) { const result = []; root.traverse(m => { if (m.isMesh) result.push(m); }); return result; }
function triangles(root) {
  root.updateMatrixWorld(true); return meshes(root).flatMap(m => {
    const pos = m.geometry.attributes.position, idx = m.geometry.index, count = idx?.count ?? pos.count, result = [];
    for (let i = 0; i < count; i += 3) result.push([0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld).toArray()));
    return result;
  });
}
function signature(root) {
  root.updateMatrixWorld(true); return meshes(root).map(m => ({ matrix: m.matrixWorld.toArray(), material: m.material.uuid,
    attributes: Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, a]) => { const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; return [k, { hash: digest(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)), itemSize: a.itemSize, count: a.count, normalized: a.normalized }]; })),
    index: m.geometry.index ? Array.from(m.geometry.index.array) : null }));
}
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file), independent = [];
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue; const m = n.getWorldMatrix();
  for (const primitive of n.getMesh().listPrimitives()) {
    const a = primitive.getAttribute('POSITION'), idx = primitive.getIndices(), count = idx?.getCount() ?? a.getCount();
    for (let i = 0; i < count; i += 3) independent.push([0, 1, 2].map(k => {
      const p = a.getElement(idx ? idx.getScalar(i + k) : i + k, []);
      return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
    }));
  }
}
const original = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(initialBytes.buffer.slice(initialBytes.byteOffset, initialBytes.byteOffset + initialBytes.byteLength), '')).scene;
const before = signature(original), originalTriangles = triangles(original), expected = originalTriangles.filter(targeted);
const model = createBroadway683Model(original);
const report = { source: file, sourceHash, independentTotal: independent.length, independentTarget: independent.filter(targeted).length };

test('Independent decoded source isolates exactly seventy exposed tower triangles and builder never mutates source', () => {
  assert.equal(independent.filter(targeted).length, 70); assert.equal(expected.length, 70); assert.equal(originalTriangles.length, independent.length);
  assert.deepEqual(signature(original), before); assert.equal(model.userData.buildingId, '683-broadway');
  assert.deepEqual(model.matrix.toArray(), new THREE.Matrix4().toArray());
});
test('Source shell is represented in detailed model and all geometry is finite, merged and source aligned', () => {
  const detail = triangles(model), counts = new Map(); detail.forEach(t => counts.set(key(t), (counts.get(key(t)) ?? 0) + 1));
  for (const t of expected) { const k = key(t); assert(counts.get(k) > 0, 'Missing exact retained shell triangle: ' + k); counts.set(k, counts.get(k) - 1); }
  const parts = meshes(model), bounds = new THREE.Box3().setFromObject(model);
  assert(parts.length >= 1 && parts.length <= 12); assert(detail.length > 1000 && detail.length < 100000); assert(parts.every(m => m === model || m.parent === model), 'All details merged under the single model root');
  for (const m of parts) { assert(Array.from(m.geometry.attributes.position.array).every(Number.isFinite)); assert(m.geometry.attributes.normal); }
  assert(bounds.min.x >= 184 && bounds.max.x <= 220); assert(bounds.min.z >= 294 && bounds.max.z <= 324); assert(bounds.min.y > -1 && bounds.min.y <= 4.2); assert(bounds.max.y >= 60 && bounds.max.y < 75);
  report.model = { meshes: parts.length, triangles: detail.length, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, details: model.userData, partNames: parts.map(m => m.name) };
});
test('Removal removes exact seventy triangles, retains every other original tuple and is idempotent', () => {
  assert.equal(removeReplacedBuilding(original, broadway683Replacement), 70);
  const after = signature(original), remaining = triangles(original);
  const expectedIndices = meshes(original).map((m, i) => {
    const old = before[i].index ?? Array.from({ length: m.geometry.attributes.position.count }, (_, j) => j), a = m.geometry.attributes.position, result = [];
    for (let j = 0; j < old.length; j += 3) {
      const t = old.slice(j, j + 3).map(k => new THREE.Vector3().fromBufferAttribute(a, k).applyMatrix4(m.matrixWorld).toArray());
      if (!targeted(t)) result.push(...old.slice(j, j + 3));
    } return result;
  });
  assert.deepEqual(after.map(s => s.index), expectedIndices);
  assert.deepEqual(after.map(({ index, ...s }) => s), before.map(({ index, ...s }) => s));
  assert.equal(remaining.length, originalTriangles.length - 70); assert.equal(remaining.filter(targeted).length, 0);
  // The entire retained set, including high northern roofs, low west podium and
  // shared hidden ground triangles, is protected by exact original index tuples.
  assert(remaining.some(t => t.some(p => p[1] > 66))); assert(remaining.some(t => t.every(p => Math.abs(p[1] - 8.996) < .1)));
  assert.equal(removeReplacedBuilding(original, broadway683Replacement), 0); assert.deepEqual(signature(original), after);
  assert.equal(digest(fs.readFileSync(file)), sourceHash);
  report.removed = 70; report.remaining = remaining.length;
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(`${out}/geometry-results.json`, JSON.stringify(report, null, 2) + '\n');
});
