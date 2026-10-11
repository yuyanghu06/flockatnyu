import { Vector3 } from 'three';

// Inclusive polygon test: wall centroids lie exactly on the footprint boundary.
// Small tolerance accounts for source coordinate rounding and mesh quantization.
export function insideFootprint(x, z, polygon, tolerance = 0.08) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j], [bx, bz] = polygon[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) <= tolerance) return true;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

export function removeReplacedBuilding(root, replacement) {
  root.updateMatrixWorld(true);
  let removed = 0;
  const points = [new Vector3(), new Vector3(), new Vector3()];
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const keep = [];
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
      ids.forEach((id, j) => points[j].fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld));
      // All vertices must match the recorded footprint and height range. This
      // preserves adjacent geometry and removes boundary walls as well as roofs.
      const matches = points.every(p => insideFootprint(p.x, p.z, replacement.footprint) && p.y >= replacement.datasetHeightRange[0] - 0.1 && p.y <= replacement.datasetHeightRange[1] + 0.1);
      if (matches) removed++;
      else keep.push(...ids);
    }
    geometry.setIndex(keep);
    geometry.clearGroups();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  return removed;
}

// Grass is one merged mesh spanning several Manhattan parks, so mesh bounds
// cannot select Washington Square. Filter individual triangles in world space.
export function trimDistantGrass(root, radius = 650) {
  root.updateMatrixWorld(true);
  let removed = 0;
  const point = new Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const keep = [];
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
      if (ids.every(id => {
        point.fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld);
        return Math.hypot(point.x, point.z) <= radius;
      })) keep.push(...ids);
      else removed++;
    }
    geometry.setIndex(keep);
    geometry.clearGroups();
  });
  return removed;
}

// Translating both vectors retains the user's orbit angle and zoom at a pan edge.
export function constrainPan(position, target, limits) {
  const bounds = limits.targetBounds;
  const dx = Math.max(bounds.minX, Math.min(bounds.maxX, target.x)) - target.x;
  const dz = Math.max(bounds.minZ, Math.min(bounds.maxZ, target.z)) - target.z;
  const boundedY = Math.max(bounds.minY, Math.min(bounds.maxY, target.y));
  const dy = Math.max(boundedY - target.y, limits.minCameraHeight - position.y);
  position.x += dx;
  position.y += dy;
  position.z += dz;
  target.x += dx;
  target.y += dy;
  target.z += dz;
  return dx !== 0 || dy !== 0 || dz !== 0;
}

export function validateCamera(value, limits = { minDistance: 15, maxDistance: 2600 }) {
  if (!value || value.projection !== 'perspective') throw new Error('Use a perspective camera configuration.');
  const vector = v => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000);
  if (!vector(value.position) || !vector(value.target)) throw new Error('Position and target must contain three finite coordinates within 10 km.');
  if (value.position[1] < 1 || value.position[1] <= value.target[1]) throw new Error('Camera must be above ground and above its target.');
  const distance = Math.hypot(...value.position.map((n, i) => n - value.target[i]));
  const epsilon = 1e-8;
  if (distance < limits.minDistance - epsilon || distance > limits.maxDistance + epsilon) throw new Error(`Camera distance must be between ${limits.minDistance} and ${limits.maxDistance} meters for this campus map.`);
  if (limits.targetBounds) {
    const bounds = limits.targetBounds;
    const [x, y, z] = value.target;
    if (x < bounds.minX - epsilon || x > bounds.maxX + epsilon || y < bounds.minY - epsilon || y > bounds.maxY + epsilon || z < bounds.minZ - epsilon || z > bounds.maxZ + epsilon) throw new Error(`Camera target is outside the loaded campus area. Use Reset view, or target X ${bounds.minX} to ${bounds.maxX}, Y ${bounds.minY} to ${bounds.maxY}, Z ${bounds.minZ} to ${bounds.maxZ} meters.`);
  }
  if (!(Number.isFinite(value.fov) && value.fov >= 15 && value.fov <= 90)) throw new Error('Field of view must be between 15 and 90.');
  if (!(Number.isFinite(value.near) && Number.isFinite(value.far) && value.near >= 0.01 && value.near <= 5 && value.far > value.near && value.far <= 20000)) throw new Error('Invalid camera clipping range.');
  if (!(Number.isFinite(value.zoom) && value.zoom >= 0.2 && value.zoom <= 5)) throw new Error('Camera zoom must be between 0.2 and 5.');
  const angle = Math.acos((value.position[1] - value.target[1]) / distance);
  if (angle < (limits.minPolarAngle ?? 0) - epsilon || angle > (limits.maxPolarAngle ?? Math.PI / 2 - 0.02) + epsilon) throw new Error('Camera tilt is outside the configured viewing range.');
  if (angle > Math.PI / 2 - 0.02 + epsilon) throw new Error('Keep the camera slightly above the horizon.');
  return value;
}
