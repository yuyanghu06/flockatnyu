import * as THREE from 'three';

// Marker artwork copied exactly from the reference site's navigation.ts:9–47,
// commit317a243, source SHA25680774bda7068ebb57a05e7062d9be5284df0f379adfdc67c47790f42ddaa7810.
// Unlike its destination marker, this view shares resources and follows events.
function createMarkerTexture() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=320;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Could not create the event marker canvas');
  context.shadowColor='rgba(242, 201, 76, 0.92)';context.shadowBlur=30;
  context.fillStyle='#f2c94c';context.fillRect(104,47,48,170);
  context.strokeStyle='#17140f';context.lineWidth=8;context.strokeRect(104,47,48,170);
  context.beginPath();context.arc(128,263,24,0,Math.PI*2);context.fill();context.stroke();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

/** Full authorized catalogue in; independent decorations out. Times use wall
 * clock milliseconds. Only catalogue refreshes and event boundaries rescan the
 * eligible schedule. Missing roots are resolved lazily as map assets arrive.
 */
export function createMapEventIndicators({scene,camera,getRoot,reducedMotion=false}) {
  if(!scene?.isScene||!camera?.isCamera||typeof getRoot!=='function')throw new Error('Event indicators require scene, camera and root lookup');
  const entries=new Map(),boundsCache=new WeakMap();
  const sceneInverse=new THREE.Matrix4(),cameraSpace=new THREE.Vector3();
  let schedule=[],activeIds=new Set(),nextBoundary=Infinity,previousTime=-Infinity,disposed=false;
  let texture=null,markerMaterial=null,glowMaterial=null,boundsComputations=0,reconciliations=0;
  function decorate(object) {object.userData.mapDecoration=true;object.raycast=()=>{};return object;}
  function resources() {
    if(texture)return;
    texture=createMarkerTexture();
    markerMaterial=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
    glowMaterial=new THREE.MeshBasicMaterial({color:'#f2c94c',transparent:true,opacity:.14,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,forceSinglePass:true,toneMapped:false});
  }
  function remove(id) {const entry=entries.get(id);if(entry){scene.remove(entry.decoration);entries.delete(id);}}
  function rootBounds(root) {
    let bounds=boundsCache.get(root);
    if(!bounds){
      root.updateWorldMatrix(true,true);bounds=new THREE.Box3();
      root.traverse(object=>{
        if(!object.isMesh)return;
        for(let parent=object;parent;parent=parent.parent)if(parent.userData.mapDecoration)return;
        // This is the complete architecture, including rooftop equipment and
        // instanced additions, and excludes all independent scene decorations.
        bounds.expandByObject(object);
      });
      boundsCache.set(root,bounds);boundsComputations++;
    }
    return bounds;
  }
  function create(id,root) {
    const bounds=rootBounds(root);if(bounds.isEmpty())return;
    resources();
    const decoration=decorate(new THREE.Group());decoration.name=`Active event ${id}`;
    const marker=decorate(new THREE.Sprite(markerMaterial));marker.name='Active scheduled event marker';marker.renderOrder=21;
    decoration.add(marker);
    const views=[];
    root.traverse(source=>{
      if(!source.isMesh)return;
      for(let parent=source;parent;parent=parent.parent)if(parent.userData.mapDecoration)return;
      let surface;
      if(source.isInstancedMesh){
        surface=new THREE.InstancedMesh(source.geometry,glowMaterial,0);
        surface.instanceMatrix=source.instanceMatrix;surface.count=source.count;
        surface.boundingBox=source.boundingBox;surface.boundingSphere=source.boundingSphere;
      }else surface=new THREE.Mesh(source.geometry,glowMaterial);
      decorate(surface);surface.name='Active event soft gold building glow';surface.renderOrder=3;
      surface.matrixAutoUpdate=false;surface.frustumCulled=false;
      decoration.add(surface);views.push({source,surface});
    });
    scene.add(decoration);entries.set(id,{root,bounds,decoration,marker,views});
  }
  function reconcile(now) {
    reconciliations++;activeIds=new Set();nextBoundary=Infinity;
    for(const building of schedule)for(const event of building.events){
      if(event.starts<=now&&now<event.ends)activeIds.add(building.id);
      if(event.starts>now)nextBoundary=Math.min(nextBoundary,event.starts);
      if(event.ends>now)nextBoundary=Math.min(nextBoundary,event.ends);
    }
    for(const id of entries.keys())if(!activeIds.has(id))remove(id);
  }
  function setBuildings(buildings,now=Date.now()) {
    if(disposed)return;
    const byId=new Map();
    for(const building of Array.isArray(buildings)?buildings:[]){
      if(typeof building?.id!=='string')continue;
      const events=byId.get(building.id)??[];
      for(const event of Array.isArray(building.events)?building.events:[]){
        // Missing kind is intentionally ineligible, even though older cards
        // still accept a kind-less event for compatibility.
        if(event?.kind!=='scheduled_event'||event.status!=='confirmed')continue;
        const starts=Number.isFinite(event.starts)?event.starts:Date.parse(event.startsAt);
        const ends=Number.isFinite(event.ends)?event.ends:Date.parse(event.endsAt);
        if(Number.isFinite(starts)&&Number.isFinite(ends)&&ends>starts)events.push({starts,ends});
      }
      if(events.length)byId.set(building.id,events);
    }
    schedule=[...byId].map(([id,events])=>({id,events}));
    reconcile(now);previousTime=now;update(now);
  }
  function update(now=Date.now()) {
    if(disposed)return;
    if(!Number.isFinite(now))return;
    if(now>=nextBoundary||now<previousTime)reconcile(now);
    previousTime=now;
    for(const id of activeIds){
      const root=getRoot(id),existing=entries.get(id);
      if(existing&&existing.root!==root)remove(id);
      if(root&&!entries.has(id))create(id,root);
    }
    camera.updateWorldMatrix(true,false);scene.updateWorldMatrix(true,false);sceneInverse.copy(scene.matrixWorld).invert();
    const viewportHeight=Math.max(1,globalThis.innerHeight??800);
    const motionReduced=typeof reducedMotion==='function'?Boolean(reducedMotion()):Boolean(reducedMotion);
    // Slow, smooth flashes and a small roof-relative bounce; architecture stays still.
    const bounce=motionReduced?0:(1-Math.cos((now%1400)/1400*Math.PI*2))*.5;
    if(glowMaterial)glowMaterial.opacity=motionReduced ? .14 : .08+.18*(1-Math.cos((now%1800)/1800*Math.PI*2))*.5;
    for(const {marker,bounds,views}of entries.values()){
      for(const {source,surface}of views){
        source.updateWorldMatrix(true,false);surface.matrix.copy(sceneInverse).multiply(source.matrixWorld);surface.matrixWorldNeedsUpdate=true;
        let visible=true;for(let node=source;node&&node!==scene;node=node.parent)visible&&=node.visible;
        surface.visible=visible;if(source.isInstancedMesh)surface.count=source.count;
      }
      const center=bounds.getCenter(new THREE.Vector3());center.y=bounds.max.y+2;
      cameraSpace.copy(center).applyMatrix4(camera.matrixWorldInverse);
      // Forty-eight CSS pixels at normal distances; clamp world size to avoid
      // oversized markers at the far edge of the overview.
      const viewHeight=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom:2*Math.max(.01,-cameraSpace.z)*Math.tan(THREE.MathUtils.degToRad(camera.fov??43)/2)/(camera.zoom||1);
      const height=THREE.MathUtils.clamp(viewHeight*48/viewportHeight,1,24);
      marker.scale.set(height*.8,height,1);center.y+=height*(.5+.12*bounce);
      marker.position.copy(center).applyMatrix4(sceneInverse);marker.visible=cameraSpace.z<0;
    }
  }
  function snapshot() {
    return {disposed,glowOpacity:glowMaterial?.opacity??0,activeBuildingIds:[...activeIds].sort(),pendingBuildingIds:[...activeIds].filter(id=>!entries.has(id)).sort(),nextBoundary:Number.isFinite(nextBoundary)?nextBoundary:null,reconciliations,boundsComputations,reducedMotion:typeof reducedMotion==='function'?Boolean(reducedMotion()):Boolean(reducedMotion),resources:{textures:texture?1:0,materials:markerMaterial?2:0,markers:entries.size,glowMeshes:[...entries.values()].reduce((n,e)=>n+e.views.length,0)},markers:[...entries].map(([buildingId,{marker,bounds}])=>({buildingId,position:marker.position.toArray(),scale:marker.scale.toArray(),visible:marker.visible,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}}))};
  }
  function dispose() {
    if(disposed)return;disposed=true;for(const id of entries.keys())remove(id);
    schedule=[];activeIds.clear();nextBoundary=Infinity;
    // Architecture geometry, instance buffers and materials are borrowed. Only
    // these two materials and our canvas texture belong to this controller.
    markerMaterial?.dispose();glowMaterial?.dispose();texture?.dispose();markerMaterial=glowMaterial=texture=null;
  }
  return Object.freeze({setBuildings,update,snapshot,dispose});
}
