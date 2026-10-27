import * as THREE from 'three';
export const landmarkOutlineStyle = Object.freeze({
  widthCssPixels: 2,
  understrokeCssPixels: 0.75,
  maxPixelRatio: 2,
  maxDimension: 4096,
  samples: 4,
});
/** Shared-geometry selected union; original beauty color/depth are never rerendered. */
export function createLandmarkOutline() {
  const maskScene = new THREE.Scene(),
    quadScene = new THREE.Scene(),
    quadCamera = new THREE.Camera();
  const maskMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
    toneMapped: false,
    fog: false,
  });
  const views = [],
    viewport = new THREE.Vector4(),
    color = new THREE.Color(),
    bounds = new THREE.Box3(),
    point = new THREE.Vector3();
  const uniforms = {
    maskTexture: { value: null },
    maskDepth: { value: null },
    texelSize: { value: new THREE.Vector2() },
    whiteRadius: { value: 2 },
    outerRadius: { value: 2.75 },
    strength: { value: 0 },
    crop: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
  let target = null,
    quad = null,
    material = null,
    disposed = false;
  function sync() {
    for (const { source, surface } of views) {
      source.updateWorldMatrix(true, false);
      surface.matrix.copy(source.matrixWorld);
      surface.matrixWorldNeedsUpdate = true;
      surface.layers.mask = source.layers.mask;
      let visible = true;
      for (let n = source; n; n = n.parent) visible &&= n.visible;
      surface.visible = visible;
      if (source.isInstancedMesh) {
        surface.instanceMatrix = source.instanceMatrix;
        surface.count = source.count;
      }
    }
  }
  function setRoot(root) {
    maskScene.clear();
    views.length = 0;
    if (!root || disposed) return;
    root.updateWorldMatrix(true, true);
    root.traverse((source) => {
      if (!source.isMesh || source.userData.mapDecoration) return;
      let surface;
      if (source.isInstancedMesh) {
        surface = new THREE.InstancedMesh(source.geometry, maskMaterial, 0);
        surface.instanceMatrix = source.instanceMatrix;
        surface.count = source.count;
      } else surface = new THREE.Mesh(source.geometry, maskMaterial);
      surface.userData.mapDecoration = true;
      surface.raycast = () => {};
      surface.matrixAutoUpdate = false;
      surface.frustumCulled = false;
      maskScene.add(surface);
      views.push({ source, surface });
    });
    sync();
  }
  function allocate(width, height, samples) {
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
        generateMipmaps: false,
        samples,
        resolveDepthBuffer: true,
        depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType),
      });
      target.texture.name = 'Selected landmark antialiased union';
      material = new THREE.ShaderMaterial({
        name: 'Selected white silhouette',
        glslVersion: THREE.GLSL3,
        uniforms,
        transparent: true,
        blending: THREE.NormalBlending,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        vertexShader: `uniform vec4 crop;out vec2 outlineUv;void main(){outlineUv=mix(crop.xy,crop.zw,position.xy*.5+.5);gl_Position=vec4(outlineUv*2.-1.,0.,1.);}`,
        fragmentShader: `
     precision highp float;uniform sampler2D maskTexture;uniform sampler2D maskDepth;uniform vec2 texelSize;uniform float whiteRadius;uniform float outerRadius;uniform float strength;in vec2 outlineUv;out vec4 outlineColor;
     void main(){
      float center=texture(maskTexture,outlineUv).r;if(center>=.9999)discard;
      float white=0.;float outer=0.;float nearestDepth=1.;vec2 direction=vec2(1.,0.);
      mat2 turn=mat2(.9238795325,.3826834324,-.3826834324,.9238795325);
      for(int i=0;i<16;i++){
       for(int j=0;j<3;j++){
        float radius=j==0?whiteRadius*.5:(j==1?whiteRadius:outerRadius);
        vec2 uv=outlineUv+direction*texelSize*radius;
        if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){
         float coverage=texture(maskTexture,uv).r;
         if(j<2)white=max(white,coverage);outer=max(outer,coverage);
         if(coverage>.01)nearestDepth=min(nearestDepth,texture(maskDepth,uv).r);
        }
       }
       direction=turn*direction;
      }
      white=max(0.,white-center);outer=max(0.,outer-center);
      float dark=outer*.32*(1.-white);float coverage=white+dark;float alpha=coverage*strength;if(alpha<=.001)discard;
      gl_FragDepth=nearestDepth;outlineColor=vec4((vec3(white)+vec3(.09)*dark)/coverage,alpha);
     }`,
      });
      quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      quad.raycast = () => {};
      quadScene.add(quad);
    } else if (target.width !== width || target.height !== height) target.setSize(width, height);
    uniforms.maskTexture.value = target.texture;
    uniforms.maskDepth.value = target.depthTexture;
    uniforms.texelSize.value.set(1 / width, 1 / height);
  }
  function crop(camera, width, height) {
    bounds.setFromObject(maskScene);
    if (bounds.isEmpty()) return false;
    let minX = 1,
      minY = 1,
      maxX = 0,
      maxY = 0;
    for (let i = 0; i < 8; i++) {
      point
        .set(
          i & 1 ? bounds.max.x : bounds.min.x,
          i & 2 ? bounds.max.y : bounds.min.y,
          i & 4 ? bounds.max.z : bounds.min.z,
        )
        .project(camera);
      if (point.z < -1 || point.z > 1 || !Number.isFinite(point.x + point.y)) {
        uniforms.crop.value.set(0, 0, 1, 1);
        return true;
      }
      minX = Math.min(minX, point.x * 0.5 + 0.5);
      maxX = Math.max(maxX, point.x * 0.5 + 0.5);
      minY = Math.min(minY, point.y * 0.5 + 0.5);
      maxY = Math.max(maxY, point.y * 0.5 + 0.5);
    }
    const pad = 5;
    minX = Math.max(0, minX - pad / width);
    maxX = Math.min(1, maxX + pad / width);
    minY = Math.max(0, minY - pad / height);
    maxY = Math.min(1, maxY + pad / height);
    if (minX >= maxX || minY >= maxY) return false;
    uniforms.crop.value.set(minX, minY, maxX, maxY);
    return true;
  }
  function render(renderer, camera) {
    if (disposed || !views.length) return false;
    sync();
    if (!views.some((v) => v.surface.visible)) return false;
    renderer.getCurrentViewport(viewport);
    const dpr = renderer.getPixelRatio(),
      cssWidth = viewport.z / dpr,
      cssHeight = viewport.w / dpr;
    if (cssWidth <= 0 || cssHeight <= 0 || !crop(camera, cssWidth, cssHeight)) return false;
    const scale = Math.min(
      dpr,
      landmarkOutlineStyle.maxPixelRatio,
      landmarkOutlineStyle.maxDimension / Math.max(cssWidth, cssHeight),
    );
    const w = Math.max(1, Math.round(cssWidth * scale)),
      h = Math.max(1, Math.round(cssHeight * scale));
    allocate(w, h, Math.min(4, renderer.capabilities.maxSamples));
    uniforms.whiteRadius.value = (2 * w) / cssWidth;
    uniforms.outerRadius.value = (2.75 * w) / cssWidth;
    const previous = renderer.getRenderTarget(),
      face = renderer.getActiveCubeFace(),
      mip = renderer.getActiveMipmapLevel();
    renderer.getClearColor(color);
    const alpha = renderer.getClearAlpha(),
      auto = renderer.autoClear,
      xr = renderer.xr.enabled,
      reset = renderer.info.autoReset;
    try {
      renderer.autoClear = false;
      renderer.xr.enabled = false;
      renderer.info.autoReset = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0, 0);
      renderer.clear(true, true, false);
      renderer.render(maskScene, camera);
      renderer.setRenderTarget(previous, face, mip);
      renderer.setClearColor(color, alpha);
      renderer.render(quadScene, quadCamera);
    } finally {
      renderer.setRenderTarget(previous, face, mip);
      renderer.setClearColor(color, alpha);
      renderer.autoClear = auto;
      renderer.xr.enabled = xr;
      renderer.info.autoReset = reset;
    }
    return true;
  }
  function setStrength(value) {
    uniforms.strength.value = THREE.MathUtils.clamp(value, 0, 1);
  }
  function snapshot() {
    return {
      strength: uniforms.strength.value,
      proxyCount: views.length,
      targetSize: target ? [target.width, target.height] : null,
      samples: target?.samples ?? 0,
      widthCssPixels: 2,
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    maskScene.clear();
    views.length = 0;
    target?.dispose();
    quad?.geometry.dispose();
    material?.dispose();
    maskMaterial.dispose();
  }
  return Object.freeze({ setRoot, setStrength, sync, render, snapshot, dispose });
}
