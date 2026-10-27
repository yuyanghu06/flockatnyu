import * as THREE from 'three';

const compactedGeometries = new WeakSet();

/** Distinct CPU backing-buffer bytes, not a GPU allocation or heap estimate. */
export function geometryBufferBytes(geometries) {
  const buffers = new Set();
  for (const geometry of geometries) {
    const attributes = [
      ...Object.values(geometry.attributes),
      geometry.index,
      ...Object.values(geometry.morphAttributes).flat(),
    ].filter(Boolean);
    for (const attribute of attributes)
      if (attribute.array?.buffer) buffers.add(attribute.array.buffer);
  }
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}

function packedAttribute(source) {
  const array = new source.array.constructor(source.count * source.itemSize);
  if (source.isInterleavedBufferAttribute) {
    for (let i = 0; i < source.count; i++)
      for (let j = 0; j < source.itemSize; j++)
        array[i * source.itemSize + j] = source.array[i * source.data.stride + source.offset + j];
  } else array.set(source.array.subarray(0, array.length));
  // Preserve raw integer/FP16 bit patterns; do not decode and re-quantize normals.
  const Attribute = source.isFloat16BufferAttribute
    ? THREE.Float16BufferAttribute
    : THREE.BufferAttribute;
  const result = new Attribute(array, source.itemSize, source.normalized);
  result.name = source.name;
  result.setUsage(source.isInterleavedBufferAttribute ? source.data.usage : source.usage);
  if (source.gpuType !== undefined) result.gpuType = source.gpuType;
  return result;
}

/** Before first render only. The caller explicitly identifies the known, uniform
 * untextured context material. No other materials or geometries are modified.
 * New geometries own new buffers; originals are neither mutated nor disposed,
 * because Three's GPU attribute disposal is not reference-counted across meshes.
 */
export function compactContextGeometry(root, contextMaterial) {
  const report = {
    meshes: 0,
    geometries: 0,
    beforeBytes: 0,
    afterBytes: 0,
    savedBytes: 0,
    skipped: 0,
  };
  if (
    !contextMaterial?.isMeshStandardMaterial ||
    contextMaterial.vertexColors ||
    Object.values(contextMaterial).some((v) => v?.isTexture)
  )
    return {
      ...report,
      reason:
        'Context material must be an explicitly untextured, non-vertex-colored standard material',
    };
  const candidates = [],
    allowed = new Set(['position', 'normal', 'color', 'uv', 'uv1', 'uv2', 'uv3']);
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material !== contextMaterial) return;
    const g = mesh.geometry;
    if (compactedGeometries.has(g)) return;
    if (
      mesh.isSkinnedMesh ||
      mesh.isInstancedMesh ||
      g.isInstancedBufferGeometry ||
      Object.keys(g.morphAttributes).length ||
      Object.keys(g.attributes).some((k) => !allowed.has(k)) ||
      !g.attributes.position ||
      !g.attributes.normal ||
      g.indirect
    ) {
      report.skipped++;
      return;
    }
    const retained = [g.attributes.position, g.attributes.normal, g.index].filter(Boolean);
    if (retained.some((a) => !a.array || a.isGLBufferAttribute || a.isInstancedBufferAttribute)) {
      report.skipped++;
      return;
    }
    candidates.push(mesh);
  });
  const before = [...new Set(candidates.map((m) => m.geometry))];
  report.beforeBytes = geometryBufferBytes(before);
  const replacements = new Map();
  for (const mesh of candidates) {
    const original = mesh.geometry;
    if (!replacements.has(original)) {
      const compact = new THREE.BufferGeometry();
      compact.name = original.name;
      compact.userData = { ...original.userData };
      compact.setAttribute('position', packedAttribute(original.attributes.position));
      compact.setAttribute('normal', packedAttribute(original.attributes.normal));
      if (original.index) compact.setIndex(packedAttribute(original.index));
      for (const g of original.groups) compact.addGroup(g.start, g.count, g.materialIndex);
      compact.setDrawRange(original.drawRange.start, original.drawRange.count);
      compact.boundingBox = original.boundingBox?.clone() ?? null;
      compact.boundingSphere = original.boundingSphere?.clone() ?? null;
      compactedGeometries.add(compact);
      replacements.set(original, compact);
    }
    mesh.geometry = replacements.get(original);
    report.meshes++;
  }
  report.geometries = replacements.size;
  report.afterBytes = geometryBufferBytes(replacements.values());
  report.savedBytes = report.beforeBytes - report.afterBytes;
  return report;
}

/** Freeze local TRS composition only. World matrices continue propagating parent
 * motion. Hovered landmark roots must keep their default dynamic local matrix.
 * Call after transforms/model construction and before scene registration.
 */
export function freezeStaticSubtree(root, { keepRootDynamic = true } = {}) {
  let frozen = 0;
  function visit(object) {
    if (
      object.userData.mapDecoration ||
      object.userData.mapDynamic ||
      object.isBone ||
      object.isSkinnedMesh ||
      object.animations.length
    )
      return;
    if (object !== root || !keepRootDynamic) {
      // Respect manually authored matrices that were already auto-update=false.
      if (object.matrixAutoUpdate) object.updateMatrix();
      object.matrixAutoUpdate = false;
      frozen++;
    }
    for (const child of object.children) visit(child);
  }
  visit(root);
  return { frozen, rootDynamic: root.matrixAutoUpdate, worldUpdatesPreserved: true };
}
