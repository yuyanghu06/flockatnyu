import * as THREE from 'three';
import { unionStreetPolygons, subtractStreetPolygons, intersectStreetPolygons } from './streets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const multi = (value) =>
  !value?.length ? [] : Array.isArray(value[0]?.[0]?.[0]) ? value : [value];
const polygonClipping = {
  union: (...values) => unionStreetPolygons(values.flatMap(multi)),
  difference: (first, ...rest) => subtractStreetPolygons(multi(first), ...rest.map(multi)),
  intersection: (a, b) => intersectStreetPolygons(multi(a), multi(b)),
};

// Park boundaries and mapped internal land cover come from the offline OSM
// snapshot. Paths are rendered by streets.js over these lower surfaces.
export function createParks(data, prepared = {}) {
  const group = new THREE.Group();
  group.name = 'Mapped parks and gardens';
  const extent = data.metadata?.extent ??
    data.extent ?? { minX: -960, maxX: 960, minZ: -960, maxZ: 1152 };
  const bounds = [
    [
      [extent.minX, extent.minZ],
      [extent.maxX, extent.minZ],
      [extent.maxX, extent.maxZ],
      [extent.minX, extent.maxZ],
      [extent.minX, extent.minZ],
    ],
  ];
  const colors = {
    lawn: '#9dbd7c',
    garden: '#88a875',
    play: '#b8aa92',
    paving: '#c4bdab',
    water: '#769da0',
    edge: '#b9b49f',
  };
  const batches = Object.fromEntries(Object.keys(colors).map((k) => [k, []]));
  const buildingMask =
    prepared.buildingFootprints ??
    data.buildingExclusions ??
    (data.buildings ?? []).map((b) => [b.points]);
  const existingFountain = (data.parks ?? []).find((p) => p.osmId === 959929617)?.rings;
  let polygons = 0;
  function surface(rings, y, key) {
    let clipped = polygonClipping.intersection(rings, bounds);
    if (prepared.pathFootprints?.length)
      clipped = polygonClipping.difference(clipped, prepared.pathFootprints);
    for (const mask of [prepared.roads, prepared.sidewalks, prepared.curbs])
      if (clipped.length && mask?.length) clipped = polygonClipping.difference(clipped, mask);
    if (existingFountain && clipped.length)
      clipped = polygonClipping.difference(clipped, existingFountain);
    if (clipped.length && buildingMask.length)
      clipped = polygonClipping.difference(clipped, buildingMask);
    for (const polygon of clipped) {
      if (polygon[0].length < 4) continue;
      const shape = new THREE.Shape(polygon[0].map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const hole of polygon.slice(1))
        shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, y, 0);
      const plain = geometry.toNonIndexed();
      geometry.dispose();
      plain.deleteAttribute('uv');
      batches[key].push(plain);
      polygons++;
    }
  }
  function classify(tags) {
    if (tags.natural === 'water' || tags.water || tags.amenity === 'fountain') return 'water';
    if (['pitch', 'playground', 'sports_centre'].includes(tags.leisure)) return 'play';
    if (
      tags.highway === 'pedestrian' ||
      tags.surface === 'paving_stones' ||
      tags.surface === 'concrete' ||
      tags.landuse === 'plaza'
    )
      return 'paving';
    if (tags.leisure === 'garden' || tags.landuse === 'flowerbed') return 'garden';
    return 'lawn';
  }
  const intersectsExtent = (p) =>
    p.rings?.[0]?.some(
      ([x, z]) => x >= extent.minX && x <= extent.maxX && z >= extent.minZ && z <= extent.maxZ,
    ) ||
    (p.rings?.length && polygonClipping.intersection(p.rings, bounds).length > 0);
  const parks = (data.parks ?? []).filter(
    (p) =>
      p.osmId !== 959929617 &&
      p.tags?.location !== 'roof' &&
      p.tags?.bridge !== 'yes' &&
      intersectsExtent(p),
  );
  const base = parks.filter((p) =>
    ['park', 'garden', 'recreation_ground', 'nature_reserve'].includes(p.tags?.leisure),
  );
  if (base.length) surface(polygonClipping.union(...base.map((p) => p.rings)), 0.68, 'lawn');
  // Explicit land cover takes precedence over general park boundaries. Union
  // same-color areas to eliminate coincident surfaces from nested OSM records.
  const areas = [...parks, ...(data.surfaces ?? [])];
  for (const [key, y] of [
    ['lawn', 0.7],
    ['garden', 0.715],
    ['paving', 0.725],
    ['play', 0.735],
    ['water', 0.745],
  ]) {
    const matching = areas.filter((p) => p.rings?.length && classify(p.tags ?? {}) === key);
    if (matching.length) surface(polygonClipping.union(...matching.map((p) => p.rings)), y, key);
  }
  const edging = [];
  for (const park of base)
    for (const ring of park.rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i],
          b = ring[i + 1],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 0.02) continue;
        const nx = (-(b[1] - a[1]) / length) * 0.12,
          nz = ((b[0] - a[0]) / length) * 0.12;
        edging.push([
          [
            [a[0] + nx, a[1] + nz],
            [b[0] + nx, b[1] + nz],
            [b[0] - nx, b[1] - nz],
            [a[0] - nx, a[1] - nz],
            [a[0] + nx, a[1] + nz],
          ],
        ]);
      }
    }
  if (edging.length) surface(polygonClipping.union(...edging), 0.75, 'edge');
  for (const [key, list] of Object.entries(batches)) {
    if (!list.length) continue;
    const geometry = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: colors[key], roughness: 1, side: THREE.DoubleSide }),
    );
    mesh.name = `Park ${key}`;
    group.add(mesh);
  }
  group.userData = {
    parkCount: parks.filter((p) => p.tags?.leisure === 'park').length,
    surfacePartCount: parks.length,
    surfaceCount: data.surfaces?.length ?? 0,
    polygons,
    coordinateSpace: 'Washington Square meters; Y up',
    source: 'OpenStreetMap snapshot; mapped coverage, not a survey',
  };
  return group;
}
