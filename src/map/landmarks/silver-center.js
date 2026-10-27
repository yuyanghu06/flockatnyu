import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { insideFootprint } from './geometry.js';

// Silver Center, 100 Washington Square East, BIN1008820.
// Preserve neighboring Brown and Waverly buildings; see docs/silver-center-reference.md.
export const silverCenterReplacement = {
  tile: 'tile-0_0.glb',
  datasetFootprintIndex: 11667,
  footprint: [
    [175.502, 40.026],
    [174.459, 39.355],
    [164.151, 55.375],
    [162.927, 57.277],
    [161.367, 56.274],
    [158.507, 54.433],
    [152.367, 63.976],
    [152.623, 64.141],
    [156.261, 66.481],
    [151.09, 74.517],
    [151.739, 74.934],
    [145.491, 84.646],
    [146.16, 85.076],
    [145.015, 86.855],
    [144.226, 86.348],
    [144.141, 86.479],
    [120.554, 71.304],
    [117.087, 69.072],
    [122.498, 60.662],
    [140.772, 32.259],
    [148.636, 20.036],
    [170.397, 34.037],
    [176.733, 38.113],
    [175.949, 39.332],
  ],
  datasetHeightRange: [1.304, 58.229],
};

/** Extract before removing the matching tile triangles. Returns an identity-root
 * Group with world/map coordinates baked into all geometry. Source tile untouched.
 * Attach buildingId nyu-silver-center to this entire returned group.
 */
export function createSilverCenterModel(tileRoot) {
  tileRoot.updateMatrixWorld(true);
  const triangles = [];
  tileRoot.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute('position'),
      index = mesh.geometry.getIndex();
    for (let i = 0; i < (index ? index.count : position.count); i += 3) {
      const points = [0, 1, 2].map((k) =>
        new THREE.Vector3()
          .fromBufferAttribute(position, index ? index.getX(i + k) : i + k)
          .applyMatrix4(mesh.matrixWorld),
      );
      if (
        points.every(
          (p) =>
            insideFootprint(p.x, p.z, silverCenterReplacement.footprint) &&
            p.y >= 1.204 &&
            p.y <= 58.329,
        )
      )
        triangles.push(points);
    }
  });
  if (!triangles.length) throw new Error('Silver Center geometry is missing from tile-0_0');
  const colors = {
    stone: '#d0c8b5',
    trim: '#e6ddc8',
    glass: '#405254',
    frame: '#494940',
    roof: '#678678',
    metal: '#96998e',
    gold: '#b1934e',
  };
  const batches = Object.fromEntries(Object.keys(colors).map((k) => [k, []]));
  const walls = new Map();
  function add(g, key) {
    const plain = g.index ? g.toNonIndexed() : g;
    if (plain !== g) g.dispose();
    plain.deleteAttribute('uv');
    batches[key].push(plain);
  }
  function box(x, y, z, w, h, d, key, angle = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(angle);
    g.translate(x, y, z);
    add(g, key);
  }
  for (const points of triangles) {
    const [a, b, c] = points;
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        points.flatMap((p) => p.toArray()),
        3,
      ),
    );
    g.computeVertexNormals();
    add(
      g,
      Math.abs(normal.y) > 0.8
        ? 'roof'
        : Math.min(...points.map((p) => p.y)) > 48
          ? 'metal'
          : 'stone',
    );
    if (Math.abs(normal.y) > 0.1) continue;
    // A CityGML vertical face is represented by two triangles. Deduplicate its
    // plan endpoints and Y range; no guessed boxes replace source setbacks.
    const plan = [
      ...new Map(points.map((p) => [`${p.x.toFixed(2)},${p.z.toFixed(2)}`, [p.x, p.z]])).values(),
    ];
    if (plan.length !== 2) continue;
    plan.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const lo = Math.min(...points.map((p) => p.y)),
      hi = Math.max(...points.map((p) => p.y));
    const key = JSON.stringify([
      plan.map((p) => p.map((n) => +n.toFixed(2))),
      Math.round(lo * 4) / 4,
      Math.round(hi * 4) / 4,
    ]);
    walls.set(key, { a: plan[0], b: plan[1], lo, hi, normal });
  }
  let windowCount = 0;
  const north = new THREE.Vector3(0.543, 0, -0.84),
    west = new THREE.Vector3(-0.84, 0, -0.543),
    south = north.clone().negate();
  for (const { a, b, lo, hi, normal } of walls.values()) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      span = Math.hypot(dx, dz);
    if (span < 1.3 || hi - lo < 2 || lo > 44) continue;
    const tx = dx / span,
      tz = dz / span,
      angle = -Math.atan2(tz, tx),
      nx = normal.x,
      nz = normal.z;
    const publicFace =
      normal.dot(west) > 0.93 || normal.dot(north) > 0.93 || normal.dot(south) > 0.93;
    function faceBox(t, y, w, h, depth, key, offset = 0.045) {
      box(
        a[0] + tx * t + nx * (depth / 2 + offset),
        y,
        a[1] + tz * t + nz * (depth / 2 + offset),
        w,
        h,
        depth,
        key,
        angle,
      );
    }
    // The park elevation has paired slender sash windows with a wider masonry
    // pier between each pair. Interior/service elevations stay simpler.
    const groups = Math.max(1, Math.round(span / (publicFace ? 5.7 : 3.3))),
      pitch = span / groups;
    for (let row = 0; row < 10; row++) {
      const y = 4.35 + row * 4.3;
      if (y - 1.3 < lo + 0.12 || y + 1.3 > hi - 0.65) continue;
      for (let col = 0; col < groups; col++) {
        const positions =
          publicFace && pitch > 4
            ? [pitch * (col + 0.5) - pitch * 0.19, pitch * (col + 0.5) + pitch * 0.19]
            : [pitch * (col + 0.5)];
        for (const t of positions) {
          const w = Math.min(publicFace ? 1.45 : 1.3, pitch * 0.3),
            h = row < 2 ? 2.95 : 2.6;
          faceBox(t, y, w + 0.26, h + 0.22, 0.12, 'trim');
          faceBox(t, y, w + 0.06, h, 0.16, 'frame', 0.1);
          faceBox(t, y, w, h - 0.11, 0.18, 'glass', 0.11);
          faceBox(t, y - 0.06, w, 0.065, 0.22, 'frame', 0.11);
          faceBox(t, y, 0.055, h, 0.22, 'frame', 0.11);
          faceBox(t, y - h / 2 - 0.12, w + 0.36, 0.18, 0.32, 'trim');
          if (publicFace && row >= 7) {
            faceBox(t, y + h / 2 + 0.12, w + 0.42, 0.18, 0.3, 'trim');
            faceBox(t, y + h / 2 + 0.29, w + 0.2, 0.12, 0.24, 'stone');
          }
          windowCount++;
        }
      }
    }
    if (!publicFace) continue;
    // Fine rustication in the base, belt courses, upper pilasters and cornice.
    for (let y = 1.8; y < 10; y += 0.85)
      if (y > lo && y < hi) faceBox(span / 2, y, span, 0.035, 0.035, 'metal');
    for (const [y, h, d] of [
      [10.65, 0.4, 0.35],
      [31.9, 0.6, 0.5],
      [32.4, 0.16, 0.65],
    ])
      if (y > lo && y < hi) faceBox(span / 2, y, span, h, d, 'trim');
    for (let col = 0; col <= groups; col++) {
      const bottom = Math.max(lo + 0.1, 32.55),
        top = Math.min(hi - 0.65, 44.75);
      if (top <= bottom) continue;
      faceBox(
        Math.min(span - 0.18, Math.max(0.18, col * pitch)),
        (bottom + top) / 2,
        0.4,
        top - bottom,
        0.2,
        'trim',
      );
      faceBox(
        Math.min(span - 0.2, Math.max(0.2, col * pitch)),
        top - 0.12,
        0.74,
        0.26,
        0.35,
        'trim',
      );
    }
    if (hi > 40 && hi < 49) {
      faceBox(span / 2, hi - 0.5, span + 0.2, 0.24, 0.48, 'trim');
      faceBox(span / 2, hi - 0.18, span + 0.45, 0.42, 0.78, 'roof');
      const dentils = Math.max(1, Math.round(span / 0.75));
      for (let i = 0; i < dentils; i++)
        faceBox(((i + 0.5) * span) / dentils, hi - 0.72, 0.22, 0.26, 0.48, 'trim');
    }
    // Gold-framed entrance treatment is based on NYU's close-up. Only the
    // Washington Place street facade gets the three-door entrance group.
    if (normal.dot(south) > 0.93 && span > 20 && lo < 2) {
      for (let door = 0; door < 3; door++) {
        const t = span * 0.5 + (door - 1) * 3.5;
        faceBox(t, 3.9, 3.02, 4.85, 0.23, 'gold', 0.24);
        faceBox(t, 3.85, 2.72, 4.52, 0.25, 'glass', 0.3);
        faceBox(t, 3.85, 0.09, 4.55, 0.3, 'gold', 0.32);
        faceBox(t, 3.3, 2.8, 0.14, 0.3, 'gold', 0.32);
        faceBox(t, 2.05, 2.8, 0.48, 0.32, 'gold', 0.32);
      }
    }
  }
  const root = new THREE.Group();
  root.name = 'Silver Center for Arts and Science';
  root.userData = {
    buildingId: 'nyu-silver-center',
    modelFidelity: 'Original CityGML massing; photo-informed facade approximation',
    coordinateSpace: 'Baked Washington Square map meters; identity root',
    sourceFootprintIndex: 11667,
    sourceTriangles: triangles.length,
    windowCount,
  };
  for (const [key, list] of Object.entries(batches)) {
    if (!list.length) continue;
    const geometry = mergeGeometries(list, false);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    list.forEach((g) => g.dispose());
    const material = new THREE.MeshStandardMaterial({
      color: colors[key],
      roughness: key === 'glass' ? 0.48 : 0.94,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Silver Center ${key}`;
    root.add(mesh);
  }
  return root;
}
