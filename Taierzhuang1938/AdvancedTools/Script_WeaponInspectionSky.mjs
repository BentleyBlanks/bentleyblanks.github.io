import * as THREE from "three";
import { SkyDome } from "../Script_Sky.mjs";

export const INSPECTION_ENVIRONMENT_PRESET = "firstLevelBattleDay";

export function BakeInspectionSky(renderer, presetName = INSPECTION_ENVIRONMENT_PRESET) {
  const sky = new SkyDome(renderer, { radius: 32, atmosphere: true, environment: false });
  const scene = new THREE.Scene();
  const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  scene.add(sky.mesh);
  try {
    const preset = sky.Apply(presetName);
    const sunDirection = sky.sunDirection.clone().normalize();
    new THREE.CubeCamera(.1, 64, target).update(renderer, scene);
    return { target, preset, sunDirection };
  } catch (error) {
    target.dispose();
    throw error;
  } finally {
    sky.Dispose();
  }
}

export function CreateInspectionSkyBackdrop(texture) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uSky: { value: texture } },
    vertexShader: /* glsl */`
      #include <common>
      varying vec3 vSkyDirection;
      void main() {
        vec2 projectionScale = vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
        // The backdrop has a fixed field of view when zooming or panning the orthographic model.
        vec2 rayScale = isOrthographic ? vec2(projectionScale.y / projectionScale.x, 1.0) * .70 : 1.0 / projectionScale;
        vSkyDirection = inverseTransformDirection(vec3(position.xy * rayScale, -1.0), viewMatrix);
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform samplerCube uSky;
      varying vec3 vSkyDirection;
      void main() {
        gl_FragColor = vec4(textureCube(uSky, normalize(vSkyDirection)).rgb, 1.0);
      }`,
    toneMapped: false,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  backdrop.name = "InspectionSky";
  backdrop.renderOrder = -1000;
  backdrop.frustumCulled = false;
  backdrop.userData.skipNormalDepth = true;
  material.allowOverride = false;
  return backdrop;
}
