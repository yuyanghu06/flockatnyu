import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WALKING = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'bridleway']);
const ROAD_WIDTH = {
  motorway: 14,
  motorway_link: 7,
  trunk: 13,
  trunk_link: 7,
  primary: 12,
  primary_link: 7,
  secondary: 10,
  secondary_link: 6,
  tertiary: 9,
  tertiary_link: 6,
  residential: 7,
  unclassified: 7,
  living_street: 5.5,
  service: 4.5,
  road: 7,
};
const PALETTE = { road: '#787d79', walk: '#bbb9ab', curb: '#d0ccbc', crossing: '#aaa99e' };
const clean = (p) => p.map((v) => Math.round(v * 10000) / 10000);
// Fixed millimeter topology avoids floating sweep-line failures on thousands of
// near-coincident OSM sidewalk junctions. No feature-dropping fallback is used.
function booleanPolygons(subject, clip, operation) {
  const paths = (polygons) =>
    polygons.flatMap((rings) =>
      rings.map((ring, i) => {
        const path = ring.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }));
        if (ClipperLib.Clipper.Orientation(path) !== (i === 0)) path.reverse();
        return path;
      }),
    );
  const engine = new ClipperLib.Clipper(),
    tree = new ClipperLib.PolyTree();
  engine.StrictlySimple = false;
  engine.AddPaths(paths(subject), ClipperLib.PolyType.ptSubject, true);
  if (clip.length) engine.AddPaths(paths(clip), ClipperLib.PolyType.ptClip, true);
  if (
    !engine.Execute(
      operation,
      tree,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    )
  )
    throw new Error('Street polygon clipping failed');
  const result = [],
    ring = (node) => {
      const r = node.Contour().map((p) => [p.X / 1000, p.Y / 1000]);
      if (r.length) r.push([...r[0]]);
      return r;
    };
  const visit = (node) => {
    for (const child of node.Childs()) {
      if (!child.IsHole())
        result.push([
          ring(child),
          ...child
            .Childs()
            .filter((n) => n.IsHole())
            .map(ring),
        ]);
      visit(child);
    }
  };
  visit(tree);
  return result;
}
const union = (polygons) =>
  polygons.length ? booleanPolygons(polygons, [], ClipperLib.ClipType.ctUnion) : [];
const difference = (a, ...b) =>
  a.length ? booleanPolygons(a, b.flat(), ClipperLib.ClipType.ctDifference) : [];
const intersect = (a, b) =>
  a.length && b.length ? booleanPolygons(a, b, ClipperLib.ClipType.ctIntersection) : [];
export const unionStreetPolygons = union;
export const subtractStreetPolygons = difference;
export const intersectStreetPolygons = intersect;

function meterWidth(value) {
  if (value === undefined) return null;
  const s = String(value).trim(),
    n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * (/ft|feet|'/.test(s) ? 0.3048 : 1);
}
function inferredWidth(tags, walking) {
  const explicit = meterWidth(tags['width:carriageway'] ?? tags.width);
  if (explicit) return Math.max(walking ? 0.8 : 2, Math.min(walking ? 18 : 32, explicit));
  if (walking)
    return tags.highway === 'pedestrian'
      ? 5
      : tags.highway === 'cycleway'
        ? 2.5
        : tags.highway === 'steps'
          ? 2.2
          : tags.footway === 'sidewalk'
            ? 2.1
            : tags.footway === 'crossing'
              ? 2.5
              : 2.5;
  const base = ROAD_WIDTH[tags.highway] ?? 7,
    lanes = parseFloat(tags.lanes);
  return Number.isFinite(lanes) && lanes > 0
    ? Math.min(26, Math.max(tags.highway === 'service' ? 3 : 5, lanes * 3 + 1))
    : base;
}

// Mitered strip through the actual OSM vertices; limited corner extension avoids
// spikes. Network-wide boolean union resolves junctions before curbs are formed.
function bufferLine(input, left, right = left) {
  const points = input.filter(
    (p, i) =>
      p.every(Number.isFinite) &&
      (!i || Math.hypot(p[0] - input[i - 1][0], p[1] - input[i - 1][1]) > 0.001),
  );
  if (points.length < 2) return null;
  const side = (distance) =>
    points.map((p, i) => {
      const a = points[Math.max(0, i - 1)],
        b = points[Math.min(points.length - 1, i + 1)];
      let dx1 = p[0] - a[0],
        dz1 = p[1] - a[1],
        dx2 = b[0] - p[0],
        dz2 = b[1] - p[1];
      if (!i) {
        dx1 = dx2;
        dz1 = dz2;
      }
      if (i === points.length - 1) {
        dx2 = dx1;
        dz2 = dz1;
      }
      const l1 = Math.hypot(dx1, dz1),
        l2 = Math.hypot(dx2, dz2),
        n1 = [-dz1 / l1, dx1 / l1],
        n2 = [-dz2 / l2, dx2 / l2];
      let nx = n1[0] + n2[0],
        nz = n1[1] + n2[1],
        l = Math.hypot(nx, nz);
      if (l < 0.01) {
        nx = n2[0];
        nz = n2[1];
        l = 1;
      }
      nx /= l;
      nz /= l;
      const denominator = Math.max(0.5, nx * n2[0] + nz * n2[1]);
      return clean([p[0] + (nx * distance) / denominator, p[1] + (nz * distance) / denominator]);
    });
  return [side(left).concat(side(-right).reverse())];
}
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}
export function containsPark(x, z, polygons) {
  return polygons.some(
    (rings) => pointInRing(x, z, rings[0]) && !rings.slice(1).some((r) => pointInRing(x, z, r)),
  );
}

/** Prepare once, then share pathFootprints with park rendering for lawn/base
 * subtraction. All outputs are GeoJSON-style MultiPolygon X/Z coordinate arrays.
 */
export function prepareStreetSurfaces(data) {
  const extent = data.extent ??
    data.metadata?.extent ?? { minX: -960, maxX: 960, minZ: -960, maxZ: 1152 };
  const clip = [
    [
      [
        [extent.minX, extent.minZ],
        [extent.maxX, extent.minZ],
        [extent.maxX, extent.maxZ],
        [extent.minX, extent.maxZ],
      ],
    ],
  ];
  const roadShapes = [],
    walkShapes = [],
    curbShapes = [],
    pathShapes = [];
  const stats = {
    sourceWays: (data.roads ?? []).length,
    roadWays: 0,
    pathWays: 0,
    skippedGradeSeparated: 0,
    inferredWidths: 0,
  };
  for (const way of data.roads ?? []) {
    const tags = way.tags ?? {},
      h = tags.highway,
      points = way.points ?? [];
    if (!h || points.length < 2) continue;
    // A flat campus map cannot faithfully depict stacked transport levels.
    if (
      (tags.tunnel && tags.tunnel !== 'no') ||
      (tags.bridge && tags.bridge !== 'no') ||
      tags.indoor === 'yes' ||
      (tags.level !== undefined && String(tags.level) !== '0') ||
      Number(tags.layer) > 0 ||
      Number(tags.layer) < 0
    ) {
      stats.skippedGradeSeparated++;
      continue;
    }
    const walking = WALKING.has(h);
    if (!walking && !(h in ROAD_WIDTH)) continue;
    const width = inferredWidth(tags, walking);
    if (!meterWidth(tags['width:carriageway'] ?? tags.width)) stats.inferredWidths++;
    const shape =
      tags.area === 'yes' && walking && points.length > 3
        ? [points.map(clean)]
        : bufferLine(points, width / 2);
    if (!shape) continue;
    if (walking) {
      pathShapes.push(shape);
      stats.pathWays++;
      continue;
    }
    roadShapes.push(shape);
    stats.roadWays++;
    const sidewalk = tags.sidewalk ?? (/^(motorway|trunk)/.test(h) ? 'no' : 'both'),
      none = sidewalk === 'no' || sidewalk === 'none';
    const defaultWalk = h === 'service' ? 1.4 : 2.5;
    const left =
      none || sidewalk === 'right' || tags['sidewalk:left'] === 'no'
        ? 0
        : Math.min(
            5,
            meterWidth(tags['sidewalk:left:width'] ?? tags['sidewalk:width']) ?? defaultWalk,
          );
    const right =
      none || sidewalk === 'left' || tags['sidewalk:right'] === 'no'
        ? 0
        : Math.min(
            5,
            meterWidth(tags['sidewalk:right:width'] ?? tags['sidewalk:width']) ?? defaultWalk,
          );
    if (left || right) {
      walkShapes.push(bufferLine(points, width / 2 + left, width / 2 + right));
      curbShapes.push(
        bufferLine(points, width / 2 + (left ? 0.23 : 0), width / 2 + (right ? 0.23 : 0)),
      );
    }
  }
  const buildingEntries = data.buildingExclusions ?? data.buildings ?? [];
  const buildingPolygons = buildingEntries
    .map((b) => b.rings ?? [b.footprint ?? b.points ?? b])
    .filter((p) => p[0]?.length >= 3);
  const buildings = union(buildingPolygons);
  const fountain = union(
    (data.parks ?? [])
      .filter((p) => String(p.osmId) === '959929617' || p.id === 'way/959929617')
      .map((p) => p.rings),
  );
  const bounded = (polys) => difference(intersect(union(polys), clip), buildings, fountain);
  const roads = bounded(roadShapes),
    allWalk = bounded(walkShapes),
    allCurbs = bounded(curbShapes),
    pathFootprints = bounded(pathShapes);
  const parkPolygons = intersect(
    union(
      (data.parks ?? [])
        .filter((p) => p.tags?.location !== 'roof' && p.rings?.[0]?.length >= 3)
        .map((p) => p.rings),
    ),
    clip,
  );
  const curbs = difference(allCurbs, roads, pathFootprints);
  const sidewalks = difference(allWalk, roads, allCurbs, pathFootprints);
  const paths = difference(pathFootprints, roads),
    crossings = intersect(pathFootprints, roads);
  const parkPaths = intersect(paths, parkPolygons),
    outsidePaths = difference(paths, parkPolygons);
  return {
    roads,
    sidewalks,
    curbs,
    paths,
    pathFootprints,
    parkPaths,
    outsidePaths,
    crossings,
    parkPolygons,
    buildingFootprints: buildings,
    extent,
    stats: { ...stats, buildingExclusions: buildingPolygons.length },
  };
}

function polygonGeometry(polygons, height, subdivide = false) {
  const values = [];
  const emit = (a, b, c, depth = 0) => {
    const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const lengths = [distance(a, b), distance(b, c), distance(c, a)],
      longest = Math.max(...lengths);
    if (subdivide && depth < 20 && longest > 4) {
      const points = [a, b, c],
        i = lengths.indexOf(longest),
        p = points[i],
        q = points[(i + 1) % 3],
        r = points[(i + 2) % 3],
        mid = p.clone().add(q).multiplyScalar(0.5);
      emit(p, mid, r, depth + 1);
      emit(mid, q, r, depth + 1);
      return;
    }
    // X/Z positive is opposite ShapeUtils' XY winding; correct to +Y normal.
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
      points = cross > 0 ? [a, c, b] : [a, b, c];
    for (const p of points)
      values.push(p.x, typeof height === 'function' ? height(p.x, p.y) : height, p.y);
  };
  for (const rings of polygons) {
    const vectors = rings.map((r) => {
      const ring =
        r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r;
      return ring.map((p) => new THREE.Vector2(...p));
    });
    const [outer, ...holes] = vectors,
      all = vectors.flat();
    if (!outer || outer.length < 3) continue;
    for (const ids of THREE.ShapeUtils.triangulateShape(outer, holes))
      emit(...ids.map((i) => all[i]));
  }
  if (!values.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function curbSides(polygons, bottom, top) {
  const values = [];
  for (const rings of polygons)
    for (const ring of rings)
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i],
          b = ring[i + 1];
        values.push(
          a[0],
          bottom,
          a[1],
          a[0],
          top,
          a[1],
          b[0],
          top,
          b[1],
          a[0],
          bottom,
          a[1],
          b[0],
          top,
          b[1],
          b[0],
          bottom,
          b[1],
        );
      }
  if (!values.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
  g.computeVertexNormals();
  return g;
}

export function createStreets(data, prepared = prepareStreetSurfaces(data)) {
  const root = new THREE.Group();
  root.name = 'Mapped streets and pedestrian paths';
  const heights = new Map();
  // Only edges within the 3m transition can affect height. Index expanded edge
  // boxes so dense garden boundaries do not multiply every vertex's work.
  const edgeGrid = new Map(),
    cell = 16;
  for (const polygon of prepared.parkPolygons)
    for (const ring of polygon)
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i],
          b = ring[i + 1];
        for (
          let gx = Math.floor((Math.min(a[0], b[0]) - 3) / cell);
          gx <= Math.floor((Math.max(a[0], b[0]) + 3) / cell);
          gx++
        )
          for (
            let gz = Math.floor((Math.min(a[1], b[1]) - 3) / cell);
            gz <= Math.floor((Math.max(a[1], b[1]) + 3) / cell);
            gz++
          ) {
            const key = `${gx},${gz}`;
            if (!edgeGrid.has(key)) edgeGrid.set(key, []);
            edgeGrid.get(key).push([a, b]);
          }
      }
  const pathHeight = (x, z) => {
    const key = `${x.toFixed(4)},${z.toFixed(4)}`;
    if (heights.has(key)) return heights.get(key);
    let distance = Infinity;
    for (const [a, b] of edgeGrid.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []) {
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        t = Math.max(
          0,
          Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
        );
      distance = Math.min(distance, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    }
    const f = Math.min(1, distance / 3),
      y = 0.18 + 0.58 * f;
    heights.set(key, y);
    return y;
  };
  const groups = [
    ['road', difference(prepared.roads, prepared.crossings), 0.02],
    ['walk', prepared.sidewalks, 0.16],
    ['curb', prepared.curbs, 0.2],
    ['walk', prepared.outsidePaths, 0.18],
    ['walk', prepared.parkPaths, pathHeight],
    ['crossing', prepared.crossings, 0.028],
  ];
  const batches = {};
  for (const [material, polygons, height] of groups) {
    const g = polygonGeometry(polygons, height, typeof height === 'function');
    if (g) (batches[material] ??= []).push(g);
  }
  const sides = curbSides(prepared.curbs, 0.02, 0.2);
  if (sides) (batches.curb ??= []).push(sides);
  for (const [name, list] of Object.entries(batches)) {
    const geometry = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: PALETTE[name],
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = `Mapped ${name} surface`;
    root.add(mesh);
  }
  root.userData = {
    ...prepared.stats,
    source: 'OpenStreetMap local snapshot; widths inferred when absent',
    coordinateSpace: 'Washington Square X/Z meters; identity root',
    mergedMeshes: root.children.length,
    triangles: root.children.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0),
    pathFootprintPolygons: prepared.pathFootprints.length,
    grades: { roads: 0.02, sidewalks: 0.16, curbs: 0.2, outsidePaths: 0.18, parkPaths: 0.76 },
    limitations:
      'Ground-level network only; inferred widths and 3m park-entry grade transitions; no traffic or lane markings',
  };
  return root;
}
