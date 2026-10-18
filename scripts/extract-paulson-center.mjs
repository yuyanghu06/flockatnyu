// Extracts the John A. Paulson Center from the user's neighborhood scene GLB,
// derives its placement on the Washington Square map, and writes a self-contained
// GLB plus placement metadata. The source scene is only read, never modified.
//
// Usage: node scripts/extract-paulson-center.mjs [path/to/scene.glb]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOURCE = path.resolve(process.argv[2] ?? "/Users/yuyang/Downloads/scene.glb");
const EXPORT = path.join(ROOT, "assets/yuyang-site-3d-assets");
const OUT_MODEL = path.join(ROOT, "assets/campus-assets/models/buildings/john-a-paulson-center.glb");
const OUT_META = path.join(ROOT, "assets/campus-assets/data/extracted-buildings.json");

const BUILDING_ID = "nyu-john-a-paulson-center";
const TARGET_MESH_NODE = 10;
// Silver Towers: scene mesh node -> map dataset footprint index (identified visually
// from the three identical pinwheel towers directly west of the target).
const TOWER_PAIRS = [[12, 11190], [13, 11189], [14, 11195]];
const REPLACED_FOOTPRINT = 11179; // pre-Paulson Coles Sports Center in the CityGML tiles
const REPLACED_TILE = "tile--1_2.glb";

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const sourceHashBefore = sha256(SOURCE);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

function transformPoint(m, [x, y, z]) {
  return [
    x * m[0] + y * m[4] + z * m[8] + m[12],
    x * m[1] + y * m[5] + z * m[9] + m[13],
    x * m[2] + y * m[6] + z * m[10] + m[14],
  ];
}

function transformDirection(m, [x, y, z]) {
  const v = [x * m[0] + y * m[4] + z * m[8], x * m[1] + y * m[5] + z * m[9], x * m[2] + y * m[6] + z * m[10]];
  const length = Math.hypot(...v) || 1;
  return v.map((value) => value / length);
}

function pointInPolygon([px, pz], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polygonCentroid(ring) {
  const points = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
  return points.reduce(([sx, sz], [x, z]) => [sx + x / points.length, sz + z / points.length], [0, 0]);
}

// Reads every triangle of a document in world space.
function worldTriangles(doc) {
  const result = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;
      const position = primitive.getAttribute("POSITION");
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : position.getCount();
      const scratch = [0, 0, 0];
      for (let t = 0; t < count; t += 3) {
        const triangle = [0, 1, 2].map((k) => transformPoint(matrix, position.getElement(indices ? indices.getScalar(t + k) : t + k, scratch)));
        result.push({ node, triangle });
      }
    }
  }
  return result;
}

// ---- 1. Inspect the source scene -------------------------------------------------
const source = await io.read(SOURCE);
const sourceNodes = source.getRoot().listNodes();
const sceneBuildings = new Map();
for (const [index, node] of sourceNodes.entries()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const primitive = mesh.listPrimitives()[0];
  // Three.js Line2 outlines (instanced street lines) have no material and are not buildings.
  if (!primitive.getMaterial() || primitive.getAttribute("_INSTANCESTART")) continue;
  const matrix = node.getWorldMatrix();
  const position = primitive.getAttribute("POSITION");
  const points = [];
  for (let i = 0; i < position.getCount(); i += 1) points.push(transformPoint(matrix, position.getElement(i, [0, 0, 0])));
  const top = Math.max(...points.map((p) => p[1]));
  const roof = points.filter((p) => Math.abs(p[1] - top) < 0.05);
  sceneBuildings.set(index, {
    node,
    points,
    top,
    bottom: Math.min(...points.map((p) => p[1])),
    roofCentroid: roof.reduce(([sx, sz], p) => [sx + p[0] / roof.length, sz + p[2] / roof.length], [0, 0]),
  });
}

// ---- 2. Register the scene onto the map (2D similarity from the Silver Towers) ---
const runtime = JSON.parse(fs.readFileSync(path.join(EXPORT, "data/building-runtime.json"), "utf8"));
const A = TOWER_PAIRS.map(([sceneIndex]) => sceneBuildings.get(sceneIndex).roofCentroid);
const B = TOWER_PAIRS.map(([, footprint]) => polygonCentroid(runtime.footprints[footprint]));
const mean = (points) => points.reduce(([sx, sz], [x, z]) => [sx + x / points.length, sz + z / points.length], [0, 0]);
const meanA = mean(A);
const meanB = mean(B);
let sxx = 0, sxz = 0, varianceA = 0;
for (let i = 0; i < A.length; i += 1) {
  const [ax, az] = [A[i][0] - meanA[0], A[i][1] - meanA[1]];
  const [bx, bz] = [B[i][0] - meanB[0], B[i][1] - meanB[1]];
  sxx += ax * bx + az * bz; // dot
  sxz += ax * bz - az * bx; // cross
  varianceA += ax * ax + az * az;
}
// 2D rotation angle in the (x, z) plane mapping A onto B, and the uniform scale.
const planAngle = Math.atan2(sxz, sxx);
const horizontalScale = Math.hypot(sxx, sxz) / varianceA;
const mapPlan = ([x, z]) => {
  const c = Math.cos(planAngle), s = Math.sin(planAngle);
  return [horizontalScale * (c * x - s * z), horizontalScale * (s * x + c * z)];
};
const translation = [meanB[0] - mapPlan(meanA)[0], meanB[1] - mapPlan(meanA)[1]];
const toMap = (p) => {
  const [x, z] = mapPlan(p);
  return [x + translation[0], z + translation[1]];
};
const residuals = A.map((p, i) => Math.hypot(toMap(p)[0] - B[i][0], toMap(p)[1] - B[i][1]));

// ---- 3. Vertical scale: scene heights vs CityGML heights of matched buildings -----
const manifest = JSON.parse(fs.readFileSync(path.join(EXPORT, "models/buildings/city-tiles/manifest.json"), "utf8"));
const matches = [];
for (const [index, building] of sceneBuildings) {
  const center = toMap(building.roofCentroid);
  const hits = runtime.footprints
    .map((ring, footprint) => ({ ring, footprint }))
    .filter(({ ring }) => Math.abs(ring[0][0] - center[0]) < 150 && Math.abs(ring[0][1] - center[1]) < 150 && pointInPolygon(center, ring));
  if (hits.length === 1) matches.push({ index, footprint: hits[0].footprint, ring: hits[0].ring, sceneHeight: building.top - building.bottom });
}
const target = sceneBuildings.get(TARGET_MESH_NODE);
const targetCenter = toMap(target.roofCentroid);
const nearbyTiles = manifest.tiles.filter((tile) => Math.hypot(tile.x - targetCenter[0], tile.z - targetCenter[1]) < 300);
const datasetExtent = new Map();
const nearbyFootprints = runtime.footprints
  .map((ring, footprint) => ({ ring, footprint, center: polygonCentroid(ring) }))
  .filter(({ center }) => Math.hypot(center[0] - targetCenter[0], center[1] - targetCenter[1]) < 220);
for (const tile of nearbyTiles) {
  const doc = await io.read(path.join(EXPORT, "models/buildings/city-tiles", tile.file));
  for (const { triangle } of worldTriangles(doc)) {
    const c = [(triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3, (triangle[0][2] + triangle[1][2] + triangle[2][2]) / 3];
    for (const { ring, footprint } of nearbyFootprints) {
      if (!pointInPolygon(c, ring)) continue;
      const extent = datasetExtent.get(footprint) ?? { minY: Infinity, maxY: -Infinity, tile: tile.file };
      for (const p of triangle) {
        extent.minY = Math.min(extent.minY, p[1]);
        extent.maxY = Math.max(extent.maxY, p[1]);
      }
      datasetExtent.set(footprint, extent);
    }
  }
}
let num = 0, den = 0;
const heightPairs = [];
for (const match of matches) {
  if (match.index === TARGET_MESH_NODE) continue; // the target replaces an older building
  const extent = datasetExtent.get(match.footprint);
  if (!extent) continue;
  const datasetHeight = extent.maxY - extent.minY;
  heightPairs.push([match.index, match.footprint, round(match.sceneHeight, 2), round(datasetHeight, 2)]);
  num += match.sceneHeight * datasetHeight;
  den += match.sceneHeight * match.sceneHeight;
}
const verticalScale = num / den;
const replaced = datasetExtent.get(REPLACED_FOOTPRINT);

// ---- 4. Extract the target, bake transforms, re-center on its footprint ----------
const targetNode = target.node;
const targetMesh = targetNode.getMesh();
const targetPrimitive = targetMesh.listPrimitives()[0];
const worldMatrix = targetNode.getWorldMatrix();
const sourcePosition = targetPrimitive.getAttribute("POSITION");
const sourceNormal = targetPrimitive.getAttribute("NORMAL");
const sourceUv = targetPrimitive.getAttribute("TEXCOORD_0");
const sourceIndices = targetPrimitive.getIndices();
const sourceMaterial = targetPrimitive.getMaterial();
const localOrigin = [target.roofCentroid[0], target.bottom, target.roofCentroid[1]];

const positions = [];
const normals = [];
for (let i = 0; i < sourcePosition.getCount(); i += 1) {
  const p = transformPoint(worldMatrix, sourcePosition.getElement(i, [0, 0, 0]));
  positions.push(p[0] - localOrigin[0], p[1] - localOrigin[1], p[2] - localOrigin[2]);
  if (sourceNormal) normals.push(...transformDirection(worldMatrix, sourceNormal.getElement(i, [0, 0, 0])));
}

// Connectivity check: the target mesh must be one building, not a multi-building merge.
const vertexKey = (i) => positions.slice(i * 3, i * 3 + 3).map((v) => v.toFixed(3)).join(",");
const parent = new Map();
const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
const union = (a, b) => { parent.set(find(a), find(b)); };
const indexArray = sourceIndices ? Array.from(sourceIndices.getArray()) : [...Array(sourcePosition.getCount()).keys()];
for (let i = 0; i < sourcePosition.getCount(); i += 1) if (!parent.has(vertexKey(i))) parent.set(vertexKey(i), vertexKey(i));
for (let t = 0; t < indexArray.length; t += 3) {
  union(vertexKey(indexArray[t]), vertexKey(indexArray[t + 1]));
  union(vertexKey(indexArray[t]), vertexKey(indexArray[t + 2]));
}
const components = new Set([...parent.keys()].map(find)).size;

// Other scene buildings must not touch the target footprint (no shared geometry to split).
const footprintPlan = [];
for (let i = 0; i < positions.length; i += 3) if (Math.abs(positions[i + 1] - (target.top - target.bottom)) < 0.05) footprintPlan.push([positions[i], positions[i + 2]]);
const hull = (points) => {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of sorted.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};
const localFootprint = hull(footprintPlan);
const neighborVerticesInside = [...sceneBuildings]
  .filter(([index]) => index !== TARGET_MESH_NODE)
  .flatMap(([index, b]) => b.points.filter((p) => pointInPolygon([p[0] - localOrigin[0], p[2] - localOrigin[2]], localFootprint)).map(() => index));

// ---- 5. Write the self-contained GLB ----------------------------------------------
const out = new Document();
out.createBuffer();
const material = out
  .createMaterial("Paulson Center massing")
  .setBaseColorFactor(sourceMaterial.getBaseColorFactor())
  .setMetallicFactor(sourceMaterial.getMetallicFactor())
  .setRoughnessFactor(sourceMaterial.getRoughnessFactor())
  .setDoubleSided(sourceMaterial.getDoubleSided());
const primitive = out
  .createPrimitive()
  .setAttribute("POSITION", out.createAccessor().setType("VEC3").setArray(new Float32Array(positions)))
  .setMaterial(material);
if (normals.length) primitive.setAttribute("NORMAL", out.createAccessor().setType("VEC3").setArray(new Float32Array(normals)));
if (sourceUv) primitive.setAttribute("TEXCOORD_0", out.createAccessor().setType("VEC2").setArray(new Float32Array(sourceUv.getArray())));
if (sourceIndices) primitive.setIndices(out.createAccessor().setType("SCALAR").setArray(new Uint32Array(indexArray)));
const mesh = out.createMesh(BUILDING_ID).addPrimitive(primitive);
const node = out.createNode(BUILDING_ID).setMesh(mesh).setExtras({ buildingId: BUILDING_ID, name: "John A. Paulson Center" });
out.createScene("John A. Paulson Center").addChild(node);
out.getRoot().getAsset().generator = "tech-visualized scripts/extract-paulson-center.mjs";
out.getRoot().getAsset().extras = { source: path.basename(SOURCE), sourceSha256: sourceHashBefore, sourceMeshNode: TARGET_MESH_NODE };
fs.mkdirSync(path.dirname(OUT_MODEL), { recursive: true });
await new NodeIO().writeBinary(out).then((bytes) => fs.writeFileSync(OUT_MODEL, bytes));

// ---- 6. Placement transform and metadata ------------------------------------------
// three.js rotation.y = phi maps (x, z) -> (x cos phi + z sin phi, -x sin phi + z cos phi),
// which is the plan rotation by -phi; so phi = -planAngle.
const position = [...targetCenter];
const groundY = replaced ? replaced.minY : 0.68;
const placement = {
  position: [round(position[0]), round(groundY), round(position[1])],
  rotationY: round(-planAngle, 8),
  scale: [round(horizontalScale, 6), round(verticalScale, 6), round(horizontalScale, 6)],
};
const mapFootprint = localFootprint.map(([x, z]) => {
  const c = Math.cos(planAngle), s = Math.sin(planAngle);
  return [round(position[0] + horizontalScale * (c * x - s * z), 3), round(position[1] + horizontalScale * (s * x + c * z), 3)];
});

// Footprint overlap with dataset buildings other than the replaced one (grid sampling).
const overlaps = [];
const xs = mapFootprint.map((p) => p[0]), zs = mapFootprint.map((p) => p[1]);
const cell = 0.5;
const overlapCells = new Map();
let footprintCells = 0;
for (let x = Math.min(...xs); x <= Math.max(...xs); x += cell) {
  for (let z = Math.min(...zs); z <= Math.max(...zs); z += cell) {
    if (!pointInPolygon([x, z], mapFootprint)) continue;
    footprintCells += 1;
    for (const { ring, footprint } of nearbyFootprints) {
      if (pointInPolygon([x, z], ring)) overlapCells.set(footprint, (overlapCells.get(footprint) ?? 0) + 1);
    }
  }
}
for (const [footprint, cells] of overlapCells) overlaps.push({ footprint, areaM2: round(cells * cell * cell, 1) });

const sourceHashAfter = sha256(SOURCE);
const metadata = {
  coordinateSystem: "Washington Square origin; Y up; meters (matches assets/yuyang-site-3d-assets).",
  buildings: {
    [BUILDING_ID]: {
      name: "John A. Paulson Center",
      address: "181 Mercer Street, New York, NY",
      identityConfirmedBy: "User confirmation on 2026-10-09 that spoken 'Halcyon Center' means NYU's John A. Paulson Center.",
      file: "assets/campus-assets/models/buildings/john-a-paulson-center.glb",
      placement,
      footprintMap: mapFootprint,
      replaces: {
        description: "Pre-Paulson Coles Sports Center geometry still present in the exported CityGML tiles.",
        datasetFootprintIndex: REPLACED_FOOTPRINT,
        tile: REPLACED_TILE,
        footprint: runtime.footprints[REPLACED_FOOTPRINT],
        datasetHeightRange: replaced ? [round(replaced.minY, 3), round(replaced.maxY, 3)] : null,
        runtimeRule: "Drop tile triangles whose plan centroid lies inside this footprint.",
      },
      source: {
        file: SOURCE,
        sha256: sourceHashBefore,
        unchangedAfterExtraction: sourceHashBefore === sourceHashAfter,
        generator: source.getRoot().getAsset().generator,
        meshNode: TARGET_MESH_NODE,
        excluded: "49 neighboring building meshes and 100 Line2 street-outline meshes (no material, instanced line attributes).",
        connectedComponents: components,
        triangles: indexArray.length / 3,
        neighborVerticesInsideTargetFootprint: neighborVerticesInside.length,
        sceneHeightUnits: round(target.top - target.bottom, 3),
        localOriginInScene: localOrigin.map((v) => round(v, 4)),
      },
      derivation: {
        method: "2D similarity (Umeyama) between Silver Towers roof centroids in the scene and their CityGML footprint centroids; vertical scale by least squares of scene vs CityGML heights over other uniquely matched buildings; base set to the replaced building's CityGML ground elevation.",
        towerPairs: TOWER_PAIRS.map(([sceneIndex, footprint]) => ({ sceneMeshNode: sceneIndex, datasetFootprint: footprint })),
        horizontalScale: round(horizontalScale, 6),
        planRotationDegrees: round((planAngle * 180) / Math.PI, 5),
        translation: translation.map((v) => round(v, 4)),
        towerResidualsM: residuals.map((v) => round(v, 3)),
        verticalScale: round(verticalScale, 6),
        verticalHeightPairs: { columns: ["sceneMeshNode", "datasetFootprint", "sceneHeight", "datasetHeightM"], rows: heightPairs },
        resultingHeightM: round((target.top - target.bottom) * verticalScale, 2),
        referenceHeights: "CTBUH lists the Faculty Tower at 91 m (23 floors) and the Student Tower at 69 m (16 floors); the source scene encodes a single flat-roof prism, so the extracted massing cannot represent both towers.",
        groundY: round(groundY, 3),
      },
      footprintOverlapWithOtherDatasetBuildings: overlaps.filter((o) => o.footprint !== REPLACED_FOOTPRINT),
      footprintOverlapWithReplacedBuildingM2: overlaps.find((o) => o.footprint === REPLACED_FOOTPRINT)?.areaM2 ?? 0,
      footprintAreaM2: round(footprintCells * cell * cell, 1),
    },
  },
};
fs.mkdirSync(path.dirname(OUT_META), { recursive: true });
fs.writeFileSync(OUT_META, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ placement, components, triangles: indexArray.length / 3, residuals, verticalScale, heightM: (target.top - target.bottom) * verticalScale, overlaps, sourceUnchanged: sourceHashBefore === sourceHashAfter, neighborVerticesInside: neighborVerticesInside.length }, null, 1));
