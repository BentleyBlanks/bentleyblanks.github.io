// Large, persistent battlefield smoke. One instanced draw, separate from combat
// particle slots; all advection stays on the GPU. No collision or AI visibility.
import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";

export const BATTLE_SMOKE_ATLAS = "./Texture/Texture_BattleSmokeAtlas.png?v=20260926223000";
export const BATTLE_SMOKE_LOBES = Object.freeze({ low: 8, medium: 11, high: 14, ultra: 16 });

export function BuildBattleSmokeInstances(sources, quality = "high") {
  const count = BATTLE_SMOKE_LOBES[quality] || BATTLE_SMOKE_LOBES.high;
  const instances = [];
  for (const source of sources) {
    const p = source.backdrop;
    if (!p) continue;
    const random = Mulberry32(p.seed);
    for (let i = 0; i < count; i++) {
      instances.push({
        origin: [source.position.x, source.position.y, source.position.z],
        column: [p.height, p.baseWidth, p.crownWidth, p.life],
        flow: [p.driftX, p.driftZ, (i + random() * 0.6) / count, p.spread],
        shape: [p.aspect, p.opacity * (quality === "low" ? 1.35 : quality === "medium" ? 1.12 : 1), p.frame, random()],
        lobe: [(random() - 0.5) * 2, (random() - 0.5) * 2, 0.85 + random() * 0.3, (random() - 0.5) * 0.6],
      });
    }
  }
  return instances;
}

const VERT = /* glsl */`
attribute vec3 iOrigin;
attribute vec4 iColumn;
attribute vec4 iFlow;
attribute vec4 iShape;
attribute vec4 iLobe;
uniform float uTime;
uniform float uGlobalFade;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uFogMax;
uniform vec3 uFogColorSky;
uniform vec3 uFogColorGround;
uniform float uFogSunGain;
uniform vec3 uSunColorFog;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec4 vSmoke;
varying float vViewDepth;
varying vec4 vAerial;
void main() {
  float age = fract(uTime / iColumn.w + iFlow.z);
  float size = mix(iColumn.y, iColumn.z, pow(age, 0.7)) * iLobe.z;
  vec3 center = iOrigin + vec3(iFlow.x, 0.0, iFlow.y) * pow(age, 1.3);
  center.y += iColumn.x * age;
  center.xz += iLobe.xy * iFlow.w * (0.3 + age);
  center.x += sin(age * 7.0 + iShape.w * 31.0) * size * 0.075;
  center.z += cos(age * 5.0 + iShape.w * 19.0) * size * 0.055;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = center + right * position.x * size + upv * position.y * size * iShape.x;
  vec4 viewPos = viewMatrix * vec4(world, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
  // Atlas rows are authored top to bottom; texture upload keeps image row order.
  vUv = vec2(position.x + 0.5, 0.5 - position.y);
  float fade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.72, 1.0, age));
  // Composition is deliberately remote. Walking into a backdrop never creates
  // a near-camera opaque wall; ground/terrain still occlude the billboards.
  fade *= smoothstep(20.0, 45.0, distance(center, cameraPosition));
  vSmoke = vec4(iShape.y * fade * uGlobalFade, iShape.z, iShape.w, iLobe.w);
  vAerial = vec4(0.0);
  if (uFogDensity > 0.0) {
    vec3 rayDir = normalize(world - cameraPosition);
    float fd = 1.0 - exp(-max(vViewDepth, 0.0) * uFogDensity);
    float heightFade = exp(-max(world.y - uFogBase, 0.0) / max(uFogFalloff, 0.5));
    vec3 color = mix(uFogColorGround, uFogColorSky, clamp(rayDir.y * 2.0 + 0.35, 0.0, 1.0));
    color += uSunColorFog * pow(max(dot(rayDir, normalize(uSunDirection)), 0.0), 8.0) * uFogSunGain;
    vAerial = vec4(color, clamp(fd * heightFade, 0.0, uFogMax));
  }
}
`;

const FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform float uAtlasReady;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uDepthValid;
uniform float uTime;
varying vec2 vUv;
varying vec4 vSmoke;
varying float vViewDepth;
varying vec4 vAerial;
float CloudNoise(vec2 p) {
  return 0.5 + 0.25 * sin(p.x * 19.0 + sin(p.y * 13.0)) + 0.25 * cos(p.y * 23.0 + sin(p.x * 15.0));
}
void main() {
  vec2 q = vUv - 0.5;
  float angle = vSmoke.w + sin(uTime * 0.045 + vSmoke.z * 19.0) * 0.06;
  q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * q + 0.5;
  // Small slow warping gives the authored billows a rolling surface, while the
  // world-space particles continuously rise and shear at different rates.
  q += vec2(sin(q.y * 11.0 + uTime * 0.09 + vSmoke.z * 7.0),
            cos(q.x * 13.0 - uTime * 0.08 + vSmoke.z * 11.0)) * 0.018;
  vec2 edge = smoothstep(vec2(0.0), vec2(0.045), q) * (1.0 - smoothstep(vec2(0.955), vec2(1.0), q));
  float frame = floor(vSmoke.y + 0.5);
  vec2 cell = vec2(mod(frame, 2.0), floor(frame / 2.0));
  vec4 cloud = texture2D(uAtlas, (cell + clamp(q, 0.001, 0.999)) * 0.5);
  if (uAtlasReady < 0.5) {
    float mask = smoothstep(0.5, 0.15, length(q - 0.5)) * (0.4 + 0.6 * CloudNoise(q));
    cloud = vec4(frame < 1.5 ? vec3(0.18) : vec3(0.30, 0.25, 0.19), mask);
  }
  float alpha = cloud.a * edge.x * edge.y * vSmoke.x;
  if (alpha < 0.008) discard;
  float luminance = dot(cloud.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Keep ash neutral, dust muted ochre, and reject tiny chromatic alpha fringes.
  vec3 color = frame == 2.0 ? vec3(luminance * 1.12, luminance, luminance * 0.82)
                            : vec3(luminance * 1.04, luminance * 1.02, luminance);
  float sceneDepth = uDepthValid > 0.5 ? texture2D(uNormalDepth, gl_FragCoord.xy / uResolution).w : 0.0;
  if (sceneDepth > 0.001) alpha *= smoothstep(0.0, 2.0, sceneDepth - vViewDepth);
  // The compositor already fogs geometry-backed pixels, but skips sky depth.
  if (sceneDepth <= 0.001) color = mix(color, vAerial.rgb, vAerial.a);
  gl_FragColor = vec4(color, alpha);
}
`;

export class BattleSmoke {
  constructor({ root, shared, quality = "high", loadTexture = true }) {
    this.quality = quality;
    this.sources = new Map();
    this.dirty = true;
    this.disposed = false;
    this.loaded = false;
    this.texture = null;
    this.placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    this.placeholder.needsUpdate = true;
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0,
    ], 3));
    this.geometry.setIndex([0,1,2,0,2,3]);
    this.geometry.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...shared, uAtlas: { value: this.placeholder }, uAtlasReady: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      // Preserve HDR target alpha, as for other transparent world overlays.
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation,
    });
    MarkNoPrepass(this.material);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "BattleSmokeBackdrop";
    this.mesh.userData.skipNormalDepth = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    root.add(this.mesh);
    this.ready = loadTexture ? new Promise(resolve => {
      new THREE.TextureLoader().load(new URL(BATTLE_SMOKE_ATLAS, import.meta.url).href, texture => {
        if (this.disposed) { texture.dispose(); resolve(false); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        this.texture = texture;
        this.loaded = true;
        this.material.uniforms.uAtlas.value = texture;
        this.material.uniforms.uAtlasReady.value = 1;
        resolve(true);
      }, undefined, () => resolve(false));
    }) : Promise.resolve(false);
  }

  Set(handle, source) { this.sources.set(handle, source); this.dirty = true; }
  Remove(handle) { this.sources.delete(handle); this.dirty = true; }
  ClearParticles() { this.mesh.visible = false; }

  Update() {
    if (this.dirty) {
      const instances = BuildBattleSmokeInstances(this.sources.values(), this.quality);
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setAttribute("position", this.geometry.getAttribute("position").clone());
      geometry.setIndex(this.geometry.index.clone());
      for (const [name, key, size] of [["iOrigin","origin",3], ["iColumn","column",4],
        ["iFlow","flow",4], ["iShape","shape",4], ["iLobe","lobe",4]]) {
        geometry.setAttribute(name, new THREE.InstancedBufferAttribute(
          new Float32Array(instances.flatMap(instance => instance[key])), size));
      }
      geometry.instanceCount = instances.length;
      this.geometry.dispose();
      this.mesh.geometry = this.geometry = geometry;
      this.dirty = false;
    }
    this.mesh.visible = this.sources.size > 0;
  }

  Dispose() {
    this.disposed = true;
    this.sources.clear();
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
    this.placeholder.dispose();
  }
}
