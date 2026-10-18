import * as THREE from 'three';
import { createLandmarkFootprint } from './landmark-footprint.js';
import { createLandmarkOutline } from './landmark-outline.js';

// Source animation reference: yuyanghu06/yuyang-site commit
// 964408fb988786be80005dc8e59e81bc19f657d3. Ownership/style deviations in doc.
export const landmarkGlowStyles = Object.freeze({
  default: Object.freeze({ opacity: .18 }),
});

export function createLandmarkEffects({ scene, reducedMotion = false } = {}) {
  if (!scene?.isScene) throw new Error('Landmark effects require a Three.js scene.');
  const entries = new Map(), sceneInverse = new THREE.Matrix4();
  let disposed = false, activeId = null, selectedId = null, selectionElapsed = 0, selectionStrength = 0;
  const footprint = createLandmarkFootprint({scene});
  const outline = createLandmarkOutline();
  const overlays = new Map();
  const materials = [], availableMaterials = [];
  const fadeInSeconds = .35, fadeOutSeconds = .28;
  const motionReduced = () => typeof reducedMotion === 'function' ? Boolean(reducedMotion()) : Boolean(reducedMotion);
  function register(id, root, { footprint: sourceFootprint, footprintSpace = 'local' } = {}) {
    if (disposed) throw new Error('Landmark effect controller is disposed.');
    if (entries.has(id)) throw new Error(`Landmark effect already registered: ${id}`);
    entries.set(id, { root, baseline: root.position.clone(), footprint: sourceFootprint, footprintSpace });
  }
  function removeOverlay(id) {
    const overlay = overlays.get(id);
    if (!overlay) return;
    scene.remove(overlay.decoration);
    // Geometry and instanceMatrix belong to the architecture. Disposing them
    // through a temporary view would evict buffers still used by the source.
    overlay.material.opacity = 0;
    availableMaterials.push(overlay.material);
    overlays.delete(id);
  }
  function buildOverlay(id, entry) {
    const views = [], decoration = new THREE.Group();
    decoration.name=`Landmark glow ${id}`;
    const material = availableMaterials.pop() ?? new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      forceSinglePass: true, toneMapped: false,
    });
    if (!materials.includes(material)) materials.push(material);
    decoration.userData.mapDecoration=true;decoration.raycast=()=>{};
    entry.root.updateWorldMatrix(true,true);
    entry.root.traverse(source=>{
      if(!source.isMesh||source.userData.mapDecoration)return;
      let surface;
      if(source.isInstancedMesh) {
        // Allocate no duplicate instance transforms: count-zero constructor's
        // empty attribute is replaced with the source-owned instance buffer.
        surface=new THREE.InstancedMesh(source.geometry,material,0);
        surface.instanceMatrix=source.instanceMatrix;surface.count=source.count;
        surface.boundingBox=source.boundingBox;surface.boundingSphere=source.boundingSphere;
      } else surface=new THREE.Mesh(source.geometry,material);
      surface.name='Clickable landmark surface glow';surface.renderOrder=4;
      surface.raycast=()=>{};surface.userData.mapDecoration=true;
      surface.matrixAutoUpdate=false;
      // Avoid expensive first-hover bounds computation for instanced views.
      // Only the currently hovered building draws, so this small loss of
      // per-mesh culling is preferable to rebuilding geometry/bounds.
      surface.frustumCulled=false;
      decoration.add(surface);views.push({source,surface});
    });
    const overlay = { decoration, views, material, fade: 0, from: 0, target: 1, elapsed: 0 };
    overlays.set(id, overlay);
    scene.add(decoration);syncOverlay(overlay);
    return overlay;
  }
  function syncOverlay({views}) {
    scene.updateWorldMatrix(true,false);sceneInverse.copy(scene.matrixWorld).invert();
    for(const {source,surface} of views) {
      source.updateWorldMatrix(true,false);
      surface.matrix.copy(sceneInverse).multiply(source.matrixWorld);
      surface.matrixWorldNeedsUpdate=true;
      let visible=true;
      for(let node=source;node&&node!==scene;node=node.parent)visible&&=node.visible;
      surface.visible=visible;
      if(source.isInstancedMesh)surface.count=source.count;
    }
  }
  function setActive(hovered, selected) {
    if(disposed)return;
    const nextSelected = entries.has(selected) ? selected : null;
    if (nextSelected !== selectedId) {
      selectedId = nextSelected;
      footprint.setSelected(selectedId, selectedId ? entries.get(selectedId).root : null, selectedId ? entries.get(selectedId).footprint : null, selectedId ? entries.get(selectedId).footprintSpace : 'local');
      outline.setRoot(selectedId ? entries.get(selectedId).root : null);
      selectionStrength=motionReduced()?1:0;
      selectionElapsed=selectionStrength*.33;
      footprint.setStrength(selectionStrength);outline.setStrength(selectionStrength);
    }
    // Keep selection stable while the camera moves or the pointer leaves it.
    const next=entries.has(selected)?selected:entries.has(hovered)?hovered:null;
    if(next===activeId)return;
    const previous = activeId;
    activeId=next;
    for (const [id, overlay] of overlays) {
      overlay.from = overlay.fade;
      overlay.target = id === next ? 1 : 0;
      overlay.elapsed = 0;
    }
    // Retire older fades before borrowing a material: never allocate a third.
    if (next && !overlays.has(next) && overlays.size >= 2) {
      for (const id of overlays.keys()) {
        if (id !== next && id !== previous) removeOverlay(id);
      }
    }
    if (next && !overlays.has(next)) buildOverlay(next, entries.get(next));
  }
  function update(deltaSeconds) {
    if(disposed)return;
    const reduced=motionReduced();
    const dt=Number.isFinite(deltaSeconds)?THREE.MathUtils.clamp(deltaSeconds,0,.05):0;
    if(selectedId){
      selectionElapsed=reduced?.33:selectionElapsed+dt;
      const progress=reduced?1:Math.min(selectionElapsed/.33,1);
      selectionStrength=progress*progress*(3-2*progress);
      footprint.setStrength(selectionStrength);outline.setStrength(selectionStrength);
    }
    footprint.update();
    for (const [id, overlay] of overlays) {
      overlay.elapsed += dt;
      const duration = overlay.target ? fadeInSeconds : fadeOutSeconds;
      if(reduced)overlay.elapsed=duration;
      const progress = reduced ? 1 : Math.min(overlay.elapsed / duration, 1);
      const smooth = progress * progress * (3 - 2 * progress);
      overlay.fade = THREE.MathUtils.lerp(overlay.from, overlay.target, smooth);
      if (!overlay.target && progress === 1) { removeOverlay(id); continue; }
      overlay.material.opacity=overlay.fade*landmarkGlowStyles.default.opacity;
      syncOverlay(overlay);
    }
  }
  function renderOutline(renderer,camera) { return !disposed && selectedId ? outline.render(renderer,camera) : false; }
  function snapshot() { return { activeId, selectionStrength, ...footprint.snapshot(), outline:outline.snapshot() }; }
  function dispose() {
    if(disposed)return;disposed=true;
    for (const id of overlays.keys()) removeOverlay(id);
    activeId=selectedId=null;
    footprint.dispose();
    outline.dispose();
    for(const {root,baseline} of entries.values())root.position.copy(baseline);
    for (const material of materials) material.dispose();
    materials.length = availableMaterials.length = 0;
    entries.clear();
  }
  return Object.freeze({register,setActive,update,renderOutline,snapshot,dispose});
}
