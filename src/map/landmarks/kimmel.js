import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { insideFootprint } from './geometry.js';

export const kimmelReplacement = {
  tile: 'tile--1_0.glb',
  datasetFootprintIndex: 11652,
  footprint: [
    [-77.342, 135.871],
    [-73.989, 130.673],
    [-72.151, 127.824],
    [-62.503, 112.868],
    [-68.241, 109.166],
    [-66.416, 106.337],
    [-63.636, 102.028],
    [-50.437, 81.569],
    [-49.405, 82.235],
    [-46.758, 83.943],
    [-45.03, 81.264],
    [-20.206, 97.278],
    [-21.501, 99.286],
    [-19.397, 100.644],
    [-36.879, 127.742],
    [-52.473, 151.915],
    [-68.848, 141.35],
  ],
  datasetHeightRange: [1.525, 51.417],
};

// Inclusive footprint tests alone also collect neighboring Global Center walls
// that share a boundary. An outward-normal test and height/area guards retain
// those neighbor faces. Use this same predicate for extraction AND removal.
function belongsToKimmel(points) {
  if (
    !points.every(
      (p) => insideFootprint(p.x, p.z, kimmelReplacement.footprint) && p.y >= 1.43 && p.y <= 51.517,
    )
  )
    return false;
  const [a, b, c] = points;
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  const center = a
    .clone()
    .add(b)
    .add(c)
    .multiplyScalar(1 / 3);
  // A neighbor roof can bridge a concave notch with all three vertices on the
  // shared boundary. Its interior/centroid must belong to this footprint too.
  if (!insideFootprint(center.x, center.z, kimmelReplacement.footprint)) return false;
  const inside = insideFootprint(
    center.x - normal.x * 0.25,
    center.z - normal.z * 0.25,
    kimmelReplacement.footprint,
    0,
  );
  const outside = insideFootprint(
    center.x + normal.x * 0.25,
    center.z + normal.z * 0.25,
    kimmelReplacement.footprint,
    0,
  );
  if (Math.hypot(normal.x, normal.z) > 0.1 && !inside && outside) return false;
  const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
  if (Math.abs(normal.y) > 0.9 && area < 0.1) return false;
  return true;
}

function visitTriangles(root, callback) {
  root.updateMatrixWorld(true);
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.attributes.position,
      index = mesh.geometry.index;
    const count = index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(i + k) : i + k));
      const points = ids.map((id) =>
        new THREE.Vector3().fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld),
      );
      callback(mesh, ids, points, belongsToKimmel(points));
    }
  });
}

/** Call only AFTER createKimmelModel(tileRoot). Mutates loaded tile geometry,
 * never source GLBs. Leaves shared-boundary Global Center geometry intact. */
export function removeKimmelGeometry(tileRoot) {
  const indices = new Map();
  let removed = 0;
  visitTriangles(tileRoot, (mesh, ids, points, matches) => {
    if (!indices.has(mesh)) indices.set(mesh, []);
    if (matches) removed++;
    else indices.get(mesh).push(...ids);
  });
  for (const [mesh, keep] of indices) {
    mesh.geometry.setIndex(keep);
    mesh.geometry.clearGroups();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
  return removed;
}

/** Source massing is extracted at its original world coordinates. All additions
 * are baked into material batches. Returned root is identity: no placement needed.
 * Assign selection id nyu-kimmel-center to the complete returned group. */
export function createKimmelModel(tileRoot) {
  const triangles = [];
  visitTriangles(tileRoot, (mesh, ids, points, matches) => {
    if (matches) triangles.push(points);
  });
  if (!triangles.length) throw new Error('Kimmel source massing is missing from tile--1_0.glb.');
  const colors = {
    masonry: '#c5b591',
    stone: '#d6c9aa',
    glass: '#627c7e',
    glassLight: '#8fa5a0',
    frame: '#84918d',
    roof: '#818780',
    metal: '#aab5af',
  };
  const batches = Object.fromEntries(Object.keys(colors).map((key) => [key, []]));
  const north = new THREE.Vector3(0.5421, 0, -0.8403).normalize();
  const east = new THREE.Vector3(0.8403, 0, 0.5421).normalize();
  const south = north.clone().negate();
  const origin = new THREE.Vector3(-50.437, 0, 81.569);
  const frame = new THREE.Matrix4()
    .makeBasis(east, new THREE.Vector3(0, 1, 0), south)
    .setPosition(origin);
  const local = (p) => {
    const delta = p.clone().sub(origin);
    return { u: delta.dot(east), v: delta.dot(south) };
  };
  function add(geometry, key) {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    plain.deleteAttribute('uv');
    batches[key].push(plain);
  }
  function box(x, y, z, w, h, d, key, angle = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(angle);
    g.translate(x, y, z);
    add(g, key);
  }
  function localBox(u, y, v, w, h, d, key) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(u, y, v);
    g.applyMatrix4(frame);
    add(g, key);
  }
  function quad(points, key) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        points.flatMap((p) => p.toArray()),
        3,
      ),
    );
    g.computeVertexNormals();
    add(g, key);
  }
  const walls = new Map();
  for (const points of triangles) {
    const [a, b, c] = points;
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const lo = Math.min(...points.map((p) => p.y)),
      hi = Math.max(...points.map((p) => p.y));
    quad(points, Math.abs(normal.y) > 0.7 ? 'roof' : lo >= 38.2 ? 'glassLight' : 'masonry');
    if (Math.abs(normal.y) > 0.1) continue;
    const ends = [
      ...new Map(points.map((p) => [`${p.x.toFixed(2)},${p.z.toFixed(2)}`, [p.x, p.z]])).values(),
    ];
    if (ends.length !== 2) continue;
    ends.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const key = JSON.stringify([
      ends.map((p) => p.map((n) => +n.toFixed(2))),
      +lo.toFixed(2),
      +hi.toFixed(2),
    ]);
    walls.set(key, { a: ends[0], b: ends[1], lo, hi, normal });
  }
  let windows = 0,
    crownPanels = 0,
    displayBays = 0;
  for (const { a, b, lo, hi, normal } of walls.values()) {
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span < 1.1 || hi - lo < 1) continue;
    const tx = (b[0] - a[0]) / span,
      tz = (b[1] - a[1]) / span,
      angle = -Math.atan2(tz, tx);
    const isNorth = normal.dot(north) > 0.96,
      isEast = normal.dot(east) > 0.96,
      isSouth = normal.dot(south) > 0.96;
    const publicFace = isNorth || isEast || isSouth;
    function face(t, y, w, h, d, key, offset = 0.055) {
      box(
        a[0] + tx * t + normal.x * (d / 2 + offset),
        y,
        a[1] + tz * t + normal.z * (d / 2 + offset),
        w,
        h,
        d,
        key,
        angle,
      );
    }
    if (lo >= 38.2) {
      const columns = Math.max(1, Math.round(span / 1.55));
      const rows = Math.max(1, Math.round((hi - lo) / 2.3)),
        width = span / columns,
        height = (hi - lo) / rows;
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) {
          face(
            (column + 0.5) * width,
            lo + (row + 0.5) * height,
            width - 0.09,
            height - 0.1,
            0.04,
            row % 2 === 0 ? 'glassLight' : 'glass',
          );
          crownPanels++;
        }
      for (let row = 0; row <= rows; row++)
        face(span / 2, lo + row * height, span, 0.095, 0.14, 'metal', 0.1);
      continue;
    }
    // Party walls facing the attached Global Center keep source massing intact.
    if (!publicFace) continue;
    if (hi <= 8.0 && isNorth) continue; // Replaced by the distinctive all-glass entrance below.
    const bays = Math.max(1, Math.round(span / (isNorth ? 4.05 : 3.7))),
      pitch = span / bays;
    for (let row = 0; row < 7; row++) {
      const y = 10.1 + 4.1 * row;
      if (y - 1.5 < lo + 0.1 || y + 1.5 > hi - 0.1) continue;
      for (let column = 0; column < bays; column++) {
        const t = (column + 0.5) * pitch;
        const p = new THREE.Vector3(a[0] + tx * t, 0, a[1] + tz * t),
          l = local(p);
        // Two solid middle-story bays on the long elevation are visible in the
        // architect's northeast photograph; do not turn them into fake windows.
        if (isEast && l.v > 13 && l.v < 29 && y > 17 && y < 26) {
          face(t, y, pitch - 0.35, 3.9, 0.035, 'stone');
          continue;
        }
        // The north upper two-story central opening is modeled separately.
        if (isNorth && l.u > 16 && l.u < 23.5 && y > 28) continue;
        const width = Math.min(pitch * 0.69, 2.65),
          height = 2.85;
        face(t, y, width + 0.2, height + 0.18, 0.09, 'stone');
        face(t, y, width, height, 0.1, 'glass', 0.13);
        face(t, y, 0.09, height, 0.1, 'frame', 0.24);
        face(t, y - height / 2 + 0.02, width + 0.22, 0.105, 0.23, 'stone', 0.13);
        windows++;
      }
      face(span / 2, y + 1.9, span, 0.15, 0.1, 'stone');
    }
    if (lo < 2 && hi > 5 && (isEast || isSouth)) {
      const count = Math.max(1, Math.round(span / 4.2)),
        width = span / count;
      for (let i = 0; i < count; i++) {
        face((i + 0.5) * width, 3.8, width * 0.74, 3.7, 0.1, 'glass');
        face((i + 0.5) * width, 1.83, width * 0.78, 0.16, 0.19, 'stone');
        displayBays++;
      }
      face(span / 2, 6.9, span, 0.35, 0.28, 'stone');
    }
  }
  // Continuous blue-green corner reveals, shown clearly in both exterior views.
  // Keep these aligned with the main tower faces, below the source crown setback.
  for (const u of [8.98, 30.9]) {
    localBox(u, 23.1, 3.0, 1.55, 30.1, 0.14, 'glassLight');
    for (let y = 8.1; y < 38.1; y += 2.05) localBox(u, y, 2.88, 1.57, 0.065, 0.15, 'metal');
  }
  localBox(31.94, 23.1, 6.5, 0.14, 30.1, 1.6, 'glassLight');
  for (let y = 8.1; y < 38.1; y += 2.05) localBox(32.03, y, 6.5, 0.14, 0.065, 1.63, 'metal');
  // Tall central north glazing on floors near the crown, not an extra tower.
  localBox(19.3, 32.95, 2.96, 5.15, 9.6, 0.14, 'glass');
  for (let i = 0; i < 4; i++) localBox(16.725 + i * 1.717, 32.95, 2.84, 0.055, 9.65, 0.12, 'frame');
  for (let y = 28.2; y <= 37.8; y += 3.2) localBox(19.3, y, 2.82, 5.2, 0.07, 0.14, 'frame');

  // Park-facing cable-net glass stair entrance and gently arched canopy.
  // Exterior is modeled only: no invented public access or interior navigation.
  const entryU = 19.1,
    entryWidth = 17.4,
    frontV = -3.24;
  localBox(entryU, 4.65, frontV, entryWidth, 6.12, 0.12, 'glass');
  for (let i = 0; i <= 10; i++)
    localBox(
      entryU - entryWidth / 2 + (i * entryWidth) / 10,
      4.65,
      frontV - 0.1,
      0.055,
      6.15,
      0.13,
      'metal',
    );
  for (const y of [1.7, 4.5, 7.55])
    localBox(entryU, y, frontV - 0.1, entryWidth, 0.07, 0.13, 'metal');
  for (const u of [16.4, 21.8]) {
    localBox(u, 2.9, frontV - 0.18, 2.1, 2.8, 0.12, 'glassLight');
    localBox(u, 2.9, frontV - 0.27, 0.06, 2.8, 0.13, 'frame');
  }
  for (let i = 0; i < 16; i++) {
    const x0 = entryU - entryWidth / 2 + (entryWidth * i) / 16,
      x1 = entryU - entryWidth / 2 + (entryWidth * (i + 1)) / 16;
    const h0 = 7.85 + 2.45 * Math.sin((Math.PI * i) / 16),
      h1 = 7.85 + 2.45 * Math.sin((Math.PI * (i + 1)) / 16);
    const a = new THREE.Vector3(x0, h0, frontV - 0.1),
      b = new THREE.Vector3(x1, h1, frontV - 0.1),
      c = new THREE.Vector3(x1, h1, 2.95),
      d = new THREE.Vector3(x0, h0, 2.95);
    [a, b, c, d].forEach((p) => p.applyMatrix4(frame));
    quad([a, b, c, a, c, d], 'glassLight');
    localBox(x0, h0, frontV + 3.0, 0.065, 0.075, 6.3, 'frame');
  }
  // Shallow podium rail and roof parapets are retained as a coherent building.
  for (let v = 6; v < 30; v += 1.8) localBox(35.9, 8.3, v, 0.06, 1.0, 0.06, 'metal');
  localBox(35.9, 8.82, 18, 0.065, 0.065, 25, 'metal');
  // Extend the source building's base down to the map ground without changing
  // its entrance/roof datums. No neighboring footprint is included.
  const shape = new THREE.Shape(
    kimmelReplacement.footprint.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const foundation = new THREE.ExtrudeGeometry(shape, {
    depth: 1.65,
    steps: 1,
    bevelEnabled: false,
  });
  foundation.rotateX(-Math.PI / 2);
  foundation.translate(0, -0.12, 0);
  add(foundation, 'masonry');
  const root = new THREE.Group();
  root.name = 'Kimmel Center for University Life';
  for (const [key, geometries] of Object.entries(batches)) {
    if (!geometries.length) continue;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    const material = new THREE.MeshStandardMaterial({
      color: colors[key],
      roughness: key.startsWith('glass') ? 0.3 : key === 'metal' ? 0.45 : 0.9,
      metalness: key === 'metal' ? 0.35 : 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `Kimmel ${key}`;
    root.add(mesh);
  }
  root.userData = {
    coordinateSpace: 'Washington Square map meters; identity transform',
    modelFidelity:
      'Source CityGML massing with photo-informed facade approximation; not a survey or current entrance-access model.',
    architecture: {
      sourceTriangles: triangles.length,
      windows,
      crownPanels,
      displayBays,
      reference: 'docs/kimmel-reference.md',
      preservedNeighbor: 'Global Center for Academic and Spiritual Life, footprint11021',
    },
  };
  return root;
}
