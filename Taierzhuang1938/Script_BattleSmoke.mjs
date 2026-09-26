// Persistent roadside and distant smoke: instanced ray-marched density lobes.
// One draw, no downloaded sprite atlas, no combat slots or collision/AI cover.
import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { MakeVolumetricNoiseTexture } from "./Script_PostVolumetrics.mjs";

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
        shape: [p.aspect, p.opacity * (quality === "low" ? 1.4 : quality === "medium" ? 1.15 : 1), p.frame, random()],
        lobe: [(random() - 0.5) * 2, (random() - 0.5) * 2, 0.72 + random() * 0.52, p.nearFade || 3],
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
varying float vRadius;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vToward;
void main() {
  float age = fract(uTime / iColumn.w + iFlow.z);
  float size = mix(iColumn.y, iColumn.z, smoothstep(0.0, 0.85, age)) * iLobe.z;
  vec3 center = iOrigin + vec3(iFlow.x, 0.0, iFlow.y) * pow(age, 1.3);
  center.y += iColumn.x * age;
  center.xz += iLobe.xy * iFlow.w * (0.15 + age * age);
  center.x += sin(age * 5.0 + iShape.w * 31.0) * size * 0.12;
  center.z += cos(age * 4.0 + iShape.w * 19.0) * size * 0.10;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vRight = right;
  vUp = upv;
  vToward = normalize(cameraPosition - center);
  vec3 world = center + right * position.x * size + upv * position.y * size * iShape.x;
  vec4 viewPos = viewMatrix * vec4(world, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
  vUv = position.xy * 2.0;
  float fade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.62, 1.0, age));
  fade *= smoothstep(iLobe.w * 0.4, iLobe.w, distance(center, cameraPosition));
  vSmoke = vec4(iShape.y * fade * uGlobalFade, iShape.z, iShape.w, age);
  vRadius = size * 0.5;
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
precision highp sampler3D;
uniform sampler3D uDensity;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uDepthValid;
uniform float uTime;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec4 vSmoke;
varying float vViewDepth;
varying vec4 vAerial;
varying float vRadius;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vToward;
out vec4 fragColor;
float Density(vec3 p, vec3 flow) {
  vec2 noise = texture(uDensity, p * 0.68 + flow).rg;
  // Broad cavities break the contour; small eddies erode it without photograph
  // grain, hard sprite borders or the repeated silhouette of an atlas stamp.
  float body = 0.85 - dot(p, p);
  float field = body + (noise.r - 0.5) * 1.2 + (noise.g - 0.52) * 2.5;
  return smoothstep(0.0, 0.56, field) * (0.75 + noise.g * 0.25);
}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 0.99 || vSmoke.x < 0.001) discard;
  float sceneDepth = uDepthValid > 0.5 ? texture(uNormalDepth, gl_FragCoord.xy / uResolution).w : 0.0;
  float halfRay = sqrt(max(0.0, 1.0 - r2));
  vec3 flow = vec3(vSmoke.z * 7.3, vSmoke.z * 3.7 - uTime * 0.008, vSmoke.z * 9.1);
  vec3 light = normalize(uSunDirection + vec3(0.0, 0.25, 0.0));
  vec3 base = vSmoke.y < 0.5 ? vec3(0.105, 0.102, 0.095)
            : vSmoke.y < 1.5 ? vec3(0.31, 0.305, 0.285)
            : vSmoke.y < 2.5 ? vec3(0.32, 0.265, 0.19) : vec3(0.34, 0.325, 0.29);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < SMOKE_STEPS; i++) {
    float z = halfRay * (1.0 - 2.0 * (float(i) + 0.5) / float(SMOKE_STEPS));
    vec3 p = vRight * vUv.x + vUp * vUv.y + vToward * z;
    float density = Density(p, flow);
    float sampleDepth = vViewDepth - z * vRadius;
    if (sceneDepth > 0.001) density *= smoothstep(0.0, 0.85, sceneDepth - sampleDepth);
    float shade = clamp((density - Density(p + light * 0.25, flow)) * 0.42 + 0.58, 0.35, 0.86);
    vec3 lit = base * (0.64 + shade * 0.8);
    float a = 1.0 - exp(-density * halfRay * vSmoke.x * 9.0 / float(SMOKE_STEPS));
    sum.rgb += (1.0 - sum.a) * a * lit;
    sum.a += (1.0 - sum.a) * a;
  }
  if (sum.a < 0.004) discard;
  vec3 color = sum.rgb / max(sum.a, 0.001);
  // The compositor already fogs geometry-backed pixels, but skips sky depth.
  if (sceneDepth <= 0.001) color = mix(color, vAerial.rgb, vAerial.a);
  fragColor = vec4(color, sum.a);
}
`;

export class BattleSmoke {
  constructor({ root, shared, quality = "high" }) {
    this.quality = quality;
    this.sources = new Map();
    this.dirty = true;
    this.disposed = false;
    this.texture = MakeVolumetricNoiseTexture();
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.5,-0.5,0, 0.5,-0.5,0, 0.5,0.5,0, -0.5,0.5,0,
    ], 3));
    this.geometry.setIndex([0,1,2,0,2,3]);
    this.geometry.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...shared, uDensity: { value: this.texture } },
      glslVersion: THREE.GLSL3,
      defines: { SMOKE_STEPS: ({ low: 8, medium: 8, high: 10, ultra: 12 })[quality] || 10 },
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
  }
}
