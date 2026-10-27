import * as THREE from 'three';
import ClipperLib from 'clipper-lib';
import { kimmelReplacement } from './kimmel.js';
import { silverCenterReplacement } from './silver-center.js';
import { globalCenterReplacement } from './global-center.js';
import { leslieElabReplacement } from './leslie-elab.js';

export const footprintRingStyle = Object.freeze({
  whiteWidth: 1.15,
  darkWidth: 0.2,
  gap: 0.12,
  groundY: 0.8,
});
const known = {
  'nyu-kimmel-center': kimmelReplacement.footprint,
  'nyu-silver-center': silverCenterReplacement.footprint,
  'nyu-global-center': globalCenterReplacement.footprint,
  'nyu-leslie-elab-building': leslieElabReplacement.footprint,
};
// Source building-runtime.json footprints11005 and11632; Gould Plaza is excluded.
// Preserve both separately elevated building parts without importing the full dataset.
const sternSourceContours = [
  [
    [102.699, 221.172],
    [119.41, 231.943],
    [115.676, 237.737],
    [111.273, 244.568],
    [109.347, 247.555],
    [67.948, 220.871],
    [69.873, 217.883],
    [78.011, 205.259],
    [85.559, 210.124],
  ],
  [
    [78.011, 205.259],
    [69.368, 218.667],
    [67.948, 220.871],
    [67.214, 222.01],
    [64.585, 226.088],
    [63.786, 227.327],
    [46.343, 216.084],
    [46.31, 216.135],
    [46.07, 216.507],
    [30.536, 206.495],
    [30.856, 205.998],
    [32.477, 203.483],
    [37.996, 194.92],
    [58.394, 163.274],
    [65.363, 152.463],
    [65.679, 151.972],
    [81.228, 161.994],
    [81.486, 162.16],
    [81.378, 162.328],
    [80.967, 162.966],
    [98.137, 174.033],
    [92.789, 182.332],
    [91.896, 183.717],
    [90.732, 185.523],
    [91.354, 185.944],
    [91.939, 186.415],
    [92.483, 186.934],
    [92.981, 187.496],
    [93.431, 188.098],
    [93.829, 188.736],
    [94.119, 189.302],
    [94.172, 189.404],
    [94.458, 190.099],
    [94.684, 190.816],
    [94.85, 191.548],
    [94.955, 192.292],
    [94.996, 193.043],
    [94.975, 193.794],
    [94.891, 194.541],
    [94.745, 195.278],
    [94.537, 196],
    [94.271, 196.702],
    [93.946, 197.38],
    [93.565, 198.028],
    [93.132, 198.642],
    [92.649, 199.217],
    [92.12, 199.751],
    [91.548, 200.238],
    [90.937, 200.675],
    [90.291, 201.06],
    [89.616, 201.39],
    [88.916, 201.662],
    [88.195, 201.874],
    [88.16, 201.881],
    [87.459, 202.025],
    [86.713, 202.115],
    [85.962, 202.141],
    [85.211, 202.105],
    [84.467, 202.006],
    [83.733, 201.845],
    [83.015, 201.623],
    [82.318, 201.342],
    [81.647, 201.004],
    [81.006, 200.611],
  ],
];
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function hull(points) {
  const sorted = [
    ...new Map(points.map((p) => [p.map((v) => Math.round(v * 1000)).join(','), p])).values(),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [],
    upper = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of sorted.slice().reverse()) {
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function excluded(mesh, root) {
  for (let node = mesh; node && node !== root; node = node.parent) {
    if (node.userData.mapDecoration || /gould[ -]plaza/i.test(node.name)) return true;
  }
  return false;
}
/** Read base vertices only; Gould remains part of selection but not its building footprint. */
function deriveFootprint(id, root, authoritative, footprintSpace) {
  const point = new THREE.Vector3(),
    box = new THREE.Box3(),
    partBox = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  if (id === 'stern-school-of-business') {
    const polygons = unionSternContours();
    return {
      points: polygons.flatMap((p) => p[0]),
      polygons,
      source: 'authoritative Stern footprint union11005+11632; Gould excluded',
      approximate: false,
      footprintSpace: 'world',
    };
  }
  const provided = authoritative ?? known[id];
  if (provided)
    return {
      points: provided.map(([x, z]) => {
        point.set(x, 0, z);
        if (!authoritative || footprintSpace !== 'world') point.applyMatrix4(root.matrixWorld);
        return [point.x, point.z];
      }),
      source: 'authoritative footprint',
      approximate: false,
      footprintSpace: authoritative ? footprintSpace : 'local',
    };
  const parts = [],
    instance = new THREE.Matrix4(),
    world = new THREE.Matrix4();
  root.traverse((mesh) => {
    if (!mesh.isMesh || excluded(mesh, root)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const count = mesh.isInstancedMesh ? mesh.count : 1;
    for (let i = 0; i < count; i++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(i, instance);
        world.multiplyMatrices(mesh.matrixWorld, instance);
      } else world.copy(mesh.matrixWorld);
      partBox.copy(geometry.boundingBox).applyMatrix4(world);
      box.union(partBox);
      parts.push({ geometry, matrix: world.clone() });
    }
  });
  const base = [],
    all = [];
  for (const { geometry, matrix } of parts) {
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
      const p = [point.x, point.z];
      all.push(p);
      if (point.y <= box.min.y + 0.75) base.push(p);
    }
  }
  return {
    points: hull(base.length >= 3 ? base : all),
    source: 'lowest-band geometry hull; Gould excluded',
    approximate: true,
  };
}
function offset(points, distance) {
  const path = points.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }));
  if (!ClipperLib.Clipper.Orientation(path)) path.reverse();
  const engine = new ClipperLib.ClipperOffset(2, 25),
    result = [];
  engine.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  engine.Execute(result, distance * 1000);
  return result.map((ring) => ring.map((p) => new THREE.Vector2(p.X / 1000, p.Y / 1000)));
}
function polygonPaths(polygons) {
  return polygons.flatMap((rings) =>
    rings.map((ring, i) => {
      const path = ring.map(([x, z]) => ({ X: Math.round(x * 1000), Y: Math.round(z * 1000) }));
      if (ClipperLib.Clipper.Orientation(path) !== (i === 0)) path.reverse();
      return path;
    }),
  );
}
function treePolygons(tree) {
  const result = [],
    ring = (node) => node.Contour().map((p) => [p.X / 1000, p.Y / 1000]);
  function visit(node) {
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
  }
  visit(tree);
  return result;
}
function unionSternContours() {
  const engine = new ClipperLib.Clipper(),
    tree = new ClipperLib.PolyTree();
  engine.AddPaths(
    polygonPaths(sternSourceContours.map((r) => [r])),
    ClipperLib.PolyType.ptSubject,
    true,
  );
  engine.Execute(
    ClipperLib.ClipType.ctUnion,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return treePolygons(tree);
}
function polygonBand(polygons, innerDistance, outerDistance, y) {
  function expanded(distance) {
    const engine = new ClipperLib.ClipperOffset(2, 25),
      paths = [];
    engine.AddPaths(
      polygonPaths(polygons),
      ClipperLib.JoinType.jtMiter,
      ClipperLib.EndType.etClosedPolygon,
    );
    engine.Execute(paths, distance * 1000);
    return paths;
  }
  const engine = new ClipperLib.Clipper(),
    tree = new ClipperLib.PolyTree();
  engine.AddPaths(expanded(outerDistance), ClipperLib.PolyType.ptSubject, true);
  engine.AddPaths(expanded(innerDistance), ClipperLib.PolyType.ptClip, true);
  engine.Execute(
    ClipperLib.ClipType.ctDifference,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  const shapes = treePolygons(tree).map(([outer, ...holes]) => {
    const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(...p)));
    for (const hole of holes)
      shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(...p))));
    return shape;
  });
  return finishBand(new THREE.ShapeGeometry(shapes), polygons.flat(), y);
}
function band(points, innerDistance, outerDistance, y) {
  const outer = offset(points, outerDistance),
    inner = offset(points, innerDistance);
  const shapes = outer.map((ring) => {
    const shape = new THREE.Shape(ring);
    for (const hole of inner) shape.holes.push(new THREE.Path(hole));
    return shape;
  });
  return finishBand(new THREE.ShapeGeometry(shapes), [points], y);
}
function finishBand(geometry, rings, y) {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++)
    positions.setXYZ(i, positions.getX(i), y, positions.getY(i));
  const initial = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    let distance = Infinity,
      nearestX = x,
      nearestZ = z;
    for (const points of rings)
      for (let j = 0; j < points.length; j++) {
        const a = points[j],
          b = points[(j + 1) % points.length],
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = THREE.MathUtils.clamp(
          ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
          0,
          1,
        );
        const px = a[0] + t * dx,
          pz = a[1] + t * dz,
          d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < distance) {
          distance = d;
          nearestX = px;
          nearestZ = pz;
        }
      }
    initial.set([nearestX + (x - nearestX) * 0.55, y, nearestZ + (z - nearestZ) * 0.55], i * 3);
  }
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(initial, 3)];
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Ordinary world-space decoration: no render targets, screen passes or readback. */
export function createLandmarkFootprint({ scene }) {
  const white = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    forceSinglePass: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const dark = new THREE.MeshBasicMaterial({
    color: 0x383640,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    forceSinglePass: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  let selectedId = null,
    root = null,
    group = null,
    description = null,
    disposed = false;
  const initialInverse = new THREE.Matrix4(),
    sceneInverse = new THREE.Matrix4();
  function clear() {
    if (group) {
      scene.remove(group);
      for (const mesh of group.children) mesh.geometry.dispose();
    }
    selectedId = root = group = description = null;
  }
  function setSelected(id, nextRoot, authoritative, footprintSpace = 'local') {
    if (disposed || (id === selectedId && nextRoot === root)) return;
    clear();
    if (!id || !nextRoot) return;
    const footprint = deriveFootprint(id, nextRoot, authoritative, footprintSpace);
    if (footprint.points.length < 3) return;
    selectedId = id;
    root = nextRoot;
    description = footprint;
    initialInverse.copy(root.matrixWorld).invert();
    group = new THREE.Group();
    group.name = `Selected footprint ${id}`;
    group.userData.mapDecoration = true;
    group.raycast = () => {};
    group.matrixAutoUpdate = false;
    const { gap, whiteWidth, darkWidth, groundY } = footprintRingStyle;
    const makeBand = (inner, outer, y) =>
      footprint.polygons
        ? polygonBand(footprint.polygons, inner, outer, y)
        : band(footprint.points, inner, outer, y);
    const darkMesh = new THREE.Mesh(
      makeBand(Math.max(0, gap - darkWidth), gap + whiteWidth + darkWidth, groundY + 0.002),
      dark,
    );
    const whiteMesh = new THREE.Mesh(makeBand(gap, gap + whiteWidth, groundY + 0.012), white);
    darkMesh.renderOrder = 3;
    whiteMesh.renderOrder = 4;
    for (const mesh of [darkMesh, whiteMesh]) {
      mesh.name = 'Selected ground footprint band';
      mesh.userData.mapDecoration = true;
      mesh.raycast = () => {};
      group.add(mesh);
    }
    scene.add(group);
    setStrength(0);
    update();
  }
  function setStrength(value) {
    const strength = THREE.MathUtils.clamp(value, 0, 1);
    white.opacity = strength;
    dark.opacity = 0.78 * strength;
    if (group) for (const mesh of group.children) mesh.morphTargetInfluences[0] = 1 - strength;
  }
  function update() {
    if (!group) return;
    root.updateWorldMatrix(true, false);
    scene.updateWorldMatrix(true, false);
    sceneInverse.copy(scene.matrixWorld).invert();
    group.matrix.copy(sceneInverse).multiply(root.matrixWorld).multiply(initialInverse);
    group.matrixWorldNeedsUpdate = true;
    let visible = true;
    for (let node = root; node; node = node.parent) visible &&= node.visible;
    group.visible = visible;
  }
  function snapshot() {
    return {
      selectedId,
      ringMeshes: group ? 2 : 0,
      source: description?.source ?? null,
      approximate: description?.approximate ?? false,
      footprintSpace: description?.footprintSpace ?? 'world',
      footprint: description?.points.map((p) => [...p]) ?? [],
      footprintPolygons:
        description?.polygons?.map((p) => p.map((r) => r.map((v) => [...v]))) ?? null,
      groundY: footprintRingStyle.groundY,
      whiteWidth: footprintRingStyle.whiteWidth,
      strength: white.opacity,
    };
  }
  function dispose() {
    if (disposed) return;
    clear();
    disposed = true;
    white.dispose();
    dark.dispose();
  }
  return Object.freeze({ setSelected, setStrength, update, snapshot, dispose });
}
