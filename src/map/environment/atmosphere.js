import * as THREE from 'three';

// Shared linear-working-space gradient. Fog runs after output conversion, so
// both callers convert this result exactly once with the same renderer helper.
export const MAP_SKY_GLSL = /* glsl */ `
uniform vec3 mapSkyHorizon;
uniform vec3 mapSkyTop;
vec3 mapSkyLinear( vec3 worldDirection ) {
  float elevation = normalize( worldDirection ).y;
  float skyBlend = smoothstep( -0.12, 0.8, elevation );
  return mix( mapSkyHorizon, mapSkyTop, skyBlend );
}
vec3 mapSkyOutput( vec3 worldDirection ) {
  return linearToOutputTexel( vec4( mapSkyLinear( worldDirection ), 1.0 ) ).rgb;
}
`;

/** One analytic background draw and matching world-ray distance/edge haze. */
export function createMapAtmosphere(scene, palette, extent, settings) {
  const skyUniforms = {
    mapSkyHorizon: { value: new THREE.Color(palette.skyHorizon) },
    mapSkyTop: { value: new THREE.Color(palette.skyTop) },
  };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      mapInverseProjection: { value: new THREE.Matrix4() },
      mapCameraWorld: { value: new THREE.Matrix4() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vMapNdc;
      void main() {
        vMapNdc = position.xy;
        gl_Position = vec4( position.xy, 1.0, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <dithering_pars_fragment>
      uniform mat4 mapInverseProjection;
      uniform mat4 mapCameraWorld;
      varying vec2 vMapNdc;
      ${MAP_SKY_GLSL}
      void main() {
        vec4 cameraPoint = mapInverseProjection * vec4( vMapNdc, 1.0, 1.0 );
        vec3 cameraRay = isOrthographic ? vec3( 0.0, 0.0, -1.0 ) : cameraPoint.xyz / cameraPoint.w;
        vec3 worldRay = mat3( mapCameraWorld ) * cameraRay;
        gl_FragColor = vec4( mapSkyOutput( worldRay ), 1.0 );
        #include <dithering_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    dithering: true,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const sky = new THREE.Mesh(geometry, skyMaterial);
  sky.name = 'Analytic map sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1e9;
  sky.userData.mapDecoration = true;
  sky.raycast = () => {};
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    skyMaterial.uniforms.mapInverseProjection.value.copy(camera.projectionMatrixInverse);
    skyMaterial.uniforms.mapCameraWorld.value.copy(camera.matrixWorld);
  };
  scene.background = null;
  scene.add(sky);
  scene.fog = new THREE.Fog(palette.skyHorizon, settings.fogNear, settings.fogFar);
  const installed = new WeakSet();
  function apply(root) {
    root.traverse((mesh) => {
      if (!mesh.isMesh || mesh.userData.mapDecoration) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (installed.has(material) || material.fog === false) continue;
        installed.add(material);
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          if (
            !shader.fragmentShader.includes('#include <fog_fragment>') ||
            !shader.vertexShader.includes('#include <project_vertex>')
          )
            return;
          Object.assign(shader.uniforms, skyUniforms, {
            mapEdgeBounds: {
              value: new THREE.Vector4(extent.minX, extent.maxX, extent.minZ, extent.maxZ),
            },
            mapEdgeWidth: { value: settings.edgeFadeWidth },
          });
          shader.vertexShader = 'varying vec3 vMapWorldPosition;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
            vec4 mapVertex = vec4(transformed,1.0);
            #ifdef USE_BATCHING
              mapVertex = batchingMatrix * mapVertex;
            #endif
            #ifdef USE_INSTANCING
              mapVertex = instanceMatrix * mapVertex;
            #endif
            vMapWorldPosition = (modelMatrix * mapVertex).xyz;`,
          );
          shader.fragmentShader =
            `varying vec3 vMapWorldPosition;
            uniform vec4 mapEdgeBounds;
            uniform float mapEdgeWidth;
            ${MAP_SKY_GLSL}\n` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <fog_fragment>',
            /* glsl */ `
            #ifdef USE_FOG
              #ifdef FOG_EXP2
                float mapDistanceFog = 1.0-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
              #else
                float mapDistanceFog = smoothstep(fogNear,fogFar,vFogDepth);
              #endif
              float mapBoundary = min(min(vMapWorldPosition.x-mapEdgeBounds.x,mapEdgeBounds.y-vMapWorldPosition.x),min(vMapWorldPosition.z-mapEdgeBounds.z,mapEdgeBounds.w-vMapWorldPosition.z));
              float edgeHaze = 1.0-smoothstep(0.0,mapEdgeWidth,mapBoundary);
              float mapHaze = 1.0-(1.0-mapDistanceFog)*(1.0-edgeHaze);
              vec3 mapRay = isOrthographic ? -vec3(viewMatrix[0].z,viewMatrix[1].z,viewMatrix[2].z) : vMapWorldPosition-cameraPosition;
              gl_FragColor.rgb = mix(gl_FragColor.rgb,mapSkyOutput(mapRay),mapHaze);
            #endif
          `,
          );
        };
        material.customProgramCacheKey = () => `${previousKey.call(material)}|map-ray-sky-v2`;
        // Match the background's stable sub-LSB dither using Three's own chunk.
        material.dithering = true;
        material.needsUpdate = true;
      }
    });
  }
  return { apply, sky };
}
