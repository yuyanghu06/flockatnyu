import * as THREE from 'three';

// Source animation reference: yuyanghu06/yuyang-site commit
// 964408fb988786be80005dc8e59e81bc19f657d3. Ownership/style deviations in doc.
export const landmarkGlowStyles = Object.freeze({
  default: Object.freeze({ baseOpacity: .14, waveAmplitude: .08 }),
  'bobst-library': Object.freeze({ baseOpacity: .18, waveAmplitude: .12 }),
});

export function createLandmarkEffects({ scene, reducedMotion = false } = {}) {
  if (!scene?.isScene) throw new Error('Landmark effects require a Three.js scene.');
  const entries = new Map(), sceneInverse = new THREE.Matrix4();
  let disposed = false, activeId = null, decoration = null;
  const views = [];
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const motionReduced = () => typeof reducedMotion === 'function' ? Boolean(reducedMotion()) : Boolean(reducedMotion);
  function register(id, root) {
    if (disposed) throw new Error('Landmark effect controller is disposed.');
    if (entries.has(id)) throw new Error(`Landmark effect already registered: ${id}`);
    entries.set(id, { root, baseline: root.position.clone() });
  }
  function removeOverlay() {
    if(decoration)scene.remove(decoration);
    // Geometry and instanceMatrix belong to the architecture. Disposing them
    // through a temporary view would evict buffers still used by the source.
    views.length=0;decoration=null;material.opacity=0;
  }
  function buildOverlay(entry) {
    decoration=new THREE.Group();decoration.name=`Landmark glow ${activeId}`;
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
    scene.add(decoration);syncOverlay();
  }
  function syncOverlay() {
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
  function setActive(hovered, _selected) {
    if(disposed)return;
    const next=entries.has(hovered)?hovered:null;
    if(next===activeId)return;
    removeOverlay();activeId=next;
    if(activeId)buildOverlay(entries.get(activeId));
  }
  function update(deltaSeconds,timeSeconds=0) {
    if(disposed)return;
    const reduced=motionReduced();
    const dt=Number.isFinite(deltaSeconds)?THREE.MathUtils.clamp(deltaSeconds,0,.05):0;
    const elapsed=Number.isFinite(timeSeconds)?timeSeconds:0;
    const ease=reduced?1:1-Math.exp(-dt*9);
    for(const [id,{root,baseline}] of entries) {
      // Latest user request includes already-selected buildings in hover lift.
      const lift=!reduced&&id===activeId?4.5:0;
      root.position.y=THREE.MathUtils.lerp(root.position.y,baseline.y+lift,ease);
      if(Math.abs(root.position.y-baseline.y-lift)<.001)root.position.y=baseline.y+lift;
    }
    if(!activeId)return;
    const {baseline}=entries.get(activeId),style=landmarkGlowStyles[activeId]??landmarkGlowStyles.default;
    const wave=reduced?.5:.5+Math.sin(elapsed*3.4+baseline.y*.17)*.5;
    const hue=reduced?.56:.56+Math.sin(elapsed*.85+baseline.y*.11)*.095;
    material.color.setHSL(hue,.72,.72);
    material.opacity=THREE.MathUtils.lerp(material.opacity,style.baseOpacity+wave*style.waveAmplitude,ease);
    syncOverlay();
  }
  function dispose() {
    if(disposed)return;disposed=true;
    removeOverlay();activeId=null;
    for(const {root,baseline} of entries.values())root.position.copy(baseline);
    entries.clear();material.dispose();
  }
  return Object.freeze({register,setActive,update,dispose});
}
