import { Box3, Color, DoubleSide, MeshBasicMaterial, Scene, Vector3, WebGLRenderTarget } from 'three';

const RESOLUTION = 128;
const POP_MARGIN = 1.18;

// Render only a shared-geometry proxy: the live scene/materials are never changed.
// A small silhouette preserves concave outlines and courtyards without hundreds
// of expensive raycasts through detailed facade geometry on every camera move.
export function createPresenceLayout(renderer, camera) {
  const target = new WebGLRenderTarget(RESOLUTION, RESOLUTION, { depthBuffer: true, stencilBuffer: false });
  const scene = new Scene();
  scene.background = new Color(0);
  const material = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, toneMapped: false });
  scene.overrideMaterial = material;
  const maskCamera = camera.clone();
  const rgba = new Uint8Array(RESOLUTION * RESOLUTION * 4);
  const point = new Vector3();
  const oldColor = new Color();

  function prepare(root) {
    root.updateWorldMatrix(true, true);
    const worldBounds = new Box3().setFromObject(root);
    const size = worldBounds.getSize(new Vector3());
    const proxy = root.clone(true);
    proxy.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = true; });
    const inverse = root.matrixWorld.clone().invert();
    const corners = [];
    for (const x of [worldBounds.min.x, worldBounds.max.x]) {
      for (const y of [worldBounds.min.y, worldBounds.max.y]) {
        for (const z of [worldBounds.min.z, worldBounds.max.z]) corners.push(new Vector3(x, y, z).applyMatrix4(inverse));
      }
    }
    return { root, proxy, corners, center: worldBounds.getCenter(new Vector3()).applyMatrix4(inverse), worldSize: Math.min(size.x, size.z) * 0.24, signature: null, sampledAt: -Infinity, mask: null };
  }

  function project(state, width, height) {
    const { root } = state;
    root.updateWorldMatrix(true, false);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const corner of state.corners) {
      point.copy(corner).applyMatrix4(root.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      // A near-plane-straddling object cannot provide a useful bounded mask.
      if (point.z >= -camera.near) return null;
      point.applyMatrix4(camera.projectionMatrix);
      const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    left = Math.max(0, left); top = Math.max(0, top);
    right = Math.min(width, right); bottom = Math.min(height, bottom);
    if (right - left < 2 || bottom - top < 2) return null;
    point.copy(state.center).applyMatrix4(root.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const diameter = state.worldSize * height * camera.projectionMatrix.elements[5] / (2 * -point.z);
    return { left, top, width: right - left, height: bottom - top, diameter };
  }

  function sample(state, rect, width, height, now) {
    const signature = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, ...state.root.matrixWorld.elements, width, height].join(',');
    if (state.mask && (signature === state.signature || now - state.sampledAt < 90)) return state.mask;
    state.signature = signature;
    state.sampledAt = now;
    state.proxy.matrix.copy(state.root.matrixWorld);
    state.proxy.matrixWorldNeedsUpdate = true;
    scene.add(state.proxy);
    maskCamera.copy(camera, false);
    maskCamera.setViewOffset(width, height, rect.left, rect.top, rect.width, rect.height);
    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    renderer.getClearColor(oldColor);
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.render(scene, maskCamera);
      renderer.readRenderTargetPixels(target, 0, 0, RESOLUTION, RESOLUTION, rgba);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(oldColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      scene.remove(state.proxy);
    }
    // Distance to the silhouette boundary, measured in screen pixels. Eroding
    // by portrait radius keeps whole circles inside arbitrary building shapes.
    const distances = new Float32Array(RESOLUTION * RESOLUTION);
    const sx = rect.width / RESOLUTION, sy = rect.height / RESOLUTION;
    const diagonal = Math.hypot(sx, sy);
    for (let y = 0; y < RESOLUTION; y++) for (let x = 0; x < RESOLUTION; x++) {
      const index = y * RESOLUTION + x;
      const hit = rgba[((RESOLUTION - 1 - y) * RESOLUTION + x) * 4] > 127;
      distances[index] = hit && x > 0 && y > 0 && x < RESOLUTION - 1 && y < RESOLUTION - 1 ? 1e9 : 0;
    }
    for (let y = 1; y < RESOLUTION - 1; y++) for (let x = 1; x < RESOLUTION - 1; x++) {
      const i = y * RESOLUTION + x;
      distances[i] = Math.min(distances[i], distances[i - 1] + sx, distances[i - RESOLUTION] + sy, distances[i - RESOLUTION - 1] + diagonal, distances[i - RESOLUTION + 1] + diagonal);
    }
    for (let y = RESOLUTION - 2; y > 0; y--) for (let x = RESOLUTION - 2; x > 0; x--) {
      const i = y * RESOLUTION + x;
      distances[i] = Math.min(distances[i], distances[i + 1] + sx, distances[i + RESOLUTION] + sy, distances[i + RESOLUTION + 1] + diagonal, distances[i + RESOLUTION - 1] + diagonal);
    }
    const candidates = [];
    for (let y = 1; y < RESOLUTION - 1; y += 2) for (let x = 1; x < RESOLUTION - 1; x += 2) {
      const clearance = distances[y * RESOLUTION + x];
      if (clearance > 0) candidates.push({ u: (x + 0.5) / RESOLUTION, v: (y + 0.5) / RESOLUTION, clearance });
    }
    return state.mask = { candidates, distances, width: rect.width, height: rect.height };
  }

  function contains(mask, rect, point, radius) {
    if (!point || point.u <= 0 || point.u >= 1 || point.v <= 0 || point.v >= 1) return false;
    const x = Math.max(0, Math.min(RESOLUTION - 2, Math.floor(point.u * RESOLUTION - 0.5)));
    const y = Math.max(0, Math.min(RESOLUTION - 2, Math.floor(point.v * RESOLUTION - 0.5)));
    const i = y * RESOLUTION + x;
    const clearance = Math.min(mask.distances[i], mask.distances[i + 1], mask.distances[i + RESOLUTION], mask.distances[i + RESOLUTION + 1]);
    return clearance * Math.min(rect.width / mask.width, rect.height / mask.height) >= radius;
  }

  function pack(mask, rect, count, previous = []) {
    const scale = Math.min(rect.width / mask.width, rect.height / mask.height);
    // Preserve world size wherever possible; uniformly reduce only when the
    // visible silhouette cannot accommodate the group at the requested size.
    for (let attempt = 0; attempt < 16; attempt++) {
      const diameter = rect.diameter * 0.88 ** attempt;
      const radius = diameter * POP_MARGIN / 2;
      const candidates = mask.candidates.filter(candidate => contains(mask, rect, candidate, radius));
      const points = [];
      const scores = candidates.map(candidate => candidate.clearance * scale);
      for (let person = 0; person < count; person++) {
        const old = previous[person];
        let chosen = null;
        if (contains(mask, rect, old, radius) && points.every(other => Math.hypot((old.u - other.u) * rect.width, (old.v - other.v) * rect.height) >= diameter * POP_MARGIN)) {
          chosen = old;
        } else {
          let best = -1, score = -Infinity;
          candidates.forEach((candidate, index) => {
            if (scores[index] < 0) return;
            const preference = old ? -Math.hypot((candidate.u - old.u) * rect.width, (candidate.v - old.v) * rect.height) : scores[index];
            if (preference > score) { score = preference; best = index; }
          });
          if (best < 0) break;
          chosen = candidates[best];
        }
        points.push(chosen);
        candidates.forEach((candidate, index) => {
          const distance = Math.hypot((candidate.u - chosen.u) * rect.width, (candidate.v - chosen.v) * rect.height);
          scores[index] = distance < diameter * POP_MARGIN ? -Infinity : Math.min(scores[index], distance + candidate.clearance * scale * 0.15);
        });
      }
      if (points.length === count) return { points, diameter };
    }
    return { points: [], diameter: rect.diameter };
  }

  function focused(width, height, count, seed = 1) {
    if (!count) return { points: [], diameter: 0 };
    const gap = Math.max(8, Math.min(width, height) * 0.025);
    const margin = gap;
    let best = { columns: 1, rows: count, diameter: 0 };
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns);
      const diameter = Math.min((width - margin * 2 - gap * (columns - 1)) / columns, (height - margin * 2 - gap * (rows - 1)) / rows);
      if (diameter > best.diameter) best = { columns, rows, diameter };
    }
    const { columns, rows, diameter } = best;
    const totalHeight = rows * diameter + (rows - 1) * gap;
    const points = Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, count - row * columns);
      const rowWidth = inRow * diameter + (inRow - 1) * gap;
      return { u: ((width - rowWidth) / 2 + diameter / 2 + (index % columns) * (diameter + gap)) / width,
        v: ((height - totalHeight) / 2 + diameter / 2 + row * (diameter + gap)) / height };
    });
    // Seed once per focus session: random destinations never change on camera
    // movement or ordinary polling. Half-size portraits leave ample scatter room.
    let randomState = seed >>> 0;
    const random = () => {
      randomState += 0x6D2B79F5;
      let value = randomState;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    const visibleDiameter = diameter * 0.5;
    const inset = visibleDiameter / 2 + margin;
    const noteSpace = Math.min(72, height * 0.12);
    const scattered = [];
    for (let index = 0; index < count; index++) {
      let bestPoint = null, bestDistance = -1;
      for (let attempt = 0; attempt < 48; attempt++) {
        const point = { u: (inset + random() * Math.max(0, width - 2 * inset)) / width,
          v: (inset + noteSpace + random() * Math.max(0, height - 2 * inset - noteSpace)) / height };
        const distance = scattered.length ? Math.min(...scattered.map(other => Math.hypot((point.u - other.u) * width, (point.v - other.v) * height))) : random() * Math.max(width, height);
        if (distance >= visibleDiameter + gap && distance > bestDistance) { bestPoint = point; bestDistance = distance; }
      }
      if (!bestPoint) return { points, diameter };
      scattered.push(bestPoint);
    }
    return { points: scattered, diameter };
  }

  return { prepare, project, sample, pack, contains, focused, dispose() { target.dispose(); material.dispose(); } };
}
