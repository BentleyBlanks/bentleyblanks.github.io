// Persistent roadside and distant smoke: instanced ray-marched density lobes.
// One draw, no downloaded sprite atlas, no combat slots or collision/AI cover.
import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { MakeVolumetricNoiseTexture } from "./Script_PostVolumetrics.mjs";
import { BATTLE_SMOKE_QUALITY, BATTLE_SMOKE_STYLES, BATTLE_SMOKE_LIGHTING, BATTLE_SMOKE_ROOT as ROOT, BATTLE_SMOKE_PLUME } from "./Data_Tuning_BattleSmoke.mjs";

export const BATTLE_SMOKE_LOBES = Object.freeze(Object.fromEntries(Object.entries(BATTLE_SMOKE_QUALITY).map(([id,q])=>[id,q.lobes])));
// 没有 plume 的烟（路边烟、火根）：漂移指数 1.3、不拉宽、不压黑、不加侵蚀 —— 与 2026-09-28 之前逐比特相同。
const PLAIN_PLUME = Object.freeze([1.3, 0, 0, 0]);

export function BuildBattleSmokeInstances(sources, quality = "high") {
  const count = BATTLE_SMOKE_LOBES[quality] || BATTLE_SMOKE_LOBES.high;
  const instances = [];
  for (const source of sources) {
    const p = source.backdrop;
    if (!p) continue;
    const random = Mulberry32(p.seed);
    const style = BATTLE_SMOKE_STYLES[p.frame] || BATTLE_SMOKE_STYLES[0];
    const burstPhase = (p.seed % 4096) / 4096;
    for (let i = 0; i < count; i++) {
      instances.push({
        origin: [source.position.x, source.position.y, source.position.z],
        column: [p.height, p.baseWidth, p.crownWidth, p.life],
        flow: [p.driftX, p.driftZ, p.frame === 5 ? burstPhase + i / count * .18 : (i + random() * 0.6) / count, p.spread],
        shape: [p.aspect, p.opacity * style.opticalDepth * (BATTLE_SMOKE_QUALITY[quality] || BATTLE_SMOKE_QUALITY.high).opacity, p.frame, random()],
        lobe: [(random() - 0.5) * 2, (random() - 0.5) * 2, 0.72 + random() * 0.52, p.nearFade || 3],
        tint: style.tint, motion: style.motion, plume: p.plume || PLAIN_PLUME,
      });
    }
    if(p.ignition) {
      // Narrow continuous soot joins the hot outlet to lifted/windblown smoke.
      const rise=Math.max(ROOT.height,source.position.y-p.ignition[1]+ROOT.height);
      const rootStyle=BATTLE_SMOKE_STYLES[p.frame===1||p.frame===4?1:0];
      for(let i=0;i<ROOT.lobes;i++) instances.push({origin:p.ignition.slice(),
        column:[rise,ROOT.baseWidth,ROOT.crownWidth,ROOT.life],
        flow:[p.driftX*.025,p.driftZ*.025,(i+random()*.3)/ROOT.lobes,.35],
        shape:[1.35,ROOT.opacity,0,random()],lobe:[(random()-.5)*.4,(random()-.5)*.4,1,1.5],
        tint:rootStyle.tint,motion:rootStyle.motion,plume:PLAIN_PLUME});
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
attribute vec3 iTint;
attribute vec4 iMotion;
attribute vec4 iPlume;   // x 漂移指数, y 上部拉宽, z 根部压黑/上部稀释, w 边缘侵蚀（Data_FirstLevelDistantSmoke）
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
varying vec3 vTint;
varying vec4 vMotion;
varying vec4 vPlume;
void main() {
  float age = fract(uTime / iColumn.w + iFlow.z);
  float burst = step(4.5, iShape.z);
  float growth = mix(smoothstep(0.0, 0.85, age), pow(age, 0.4), burst);
  float size = mix(iColumn.y, iColumn.z, growth) * iLobe.z;
  // 远景柱的漂移指数大于 1.3：根部笔直、上部才被风横着拉走（路边烟仍是 1.3）
  vec3 center = iOrigin + vec3(iFlow.x, 0.0, iFlow.y) * pow(age, iPlume.x);
  vPlume = iPlume;
  center.y += iColumn.x * age;
  center.xz += iLobe.xy * iFlow.w * (0.15 + age * age);
  center.x += sin(age * 5.0 + uTime * 0.19 + iShape.w * 31.0) * size * iMotion.z;
  center.z += cos(age * 4.0 + uTime * 0.16 + iShape.w * 19.0) * size * iMotion.z * .7;
  // 烟团不再同轴叠放：同轴时每团的圆边一层套一层（洋葱圈），上部又被压成一摞飞碟。
  // 让它们按本团大小的一个比例散在柱轴四周、高度也错开，柱子才读成一团团翻滚的烟。
  // 上部拉宽主要靠这个散布，不靠把每团压扁（iPlume.y > 0 才是远景柱；路边烟只散一小部分）。
  float spreadT = iPlume.y * smoothstep(0.25, 1.0, age);
  float scatter = mix(0.13, 0.30, growth) * (1.0 + 0.7 * spreadT) * (iPlume.y > 0.0 ? 1.0 : 0.4);
  center.xz += iLobe.xy * size * scatter;
  center.y += (iShape.w - 0.5) * size * 0.22;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 upv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vRight = right;
  vUp = upv;
  vToward = normalize(cameraPosition - center);
  vTint = iTint;
  vMotion = iMotion;
  // 上部被风拉宽：每团略宽、略扁（大头在上面的散布里）
  vec3 world = center + right * position.x * size * (1.0 + 0.45 * spreadT)
    + upv * position.y * size * iShape.x * (1.0 - 0.08 * spreadT);
  vec4 viewPos = viewMatrix * vec4(world, 1.0);
  vViewDepth = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
  vUv = position.xy * 2.0;
  float fade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.62, 1.0, age));
  // One brief expanding dust pulse followed by a clear interval. Every source
  // has a different seeded phase; white screens continuously roll and refill.
  fade *= mix(1.0, 1.0 - smoothstep(0.38, 0.70, age), burst);
  fade *= 1.0 + sin(uTime * .82 + iShape.w * 13.0) * iMotion.w;
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
uniform vec3 uSmokeLighting;
uniform sampler3D uDensity;
uniform sampler2D uNormalDepth;
uniform vec2 uResolution;
uniform float uDepthValid;
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColorFog;
uniform vec3 uFogColorSky;
uniform vec3 uPlumeDilute;
uniform vec2 uPlumeLight;   // x 受光面偏太阳色, y 背光面偏冷
varying vec2 vUv;
varying vec4 vSmoke;
varying float vViewDepth;
varying vec4 vAerial;
varying float vRadius;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vToward;
varying vec3 vTint;
varying vec4 vMotion;
varying vec4 vPlume;
out vec4 fragColor;
float Density(vec3 p, vec3 flow) {
  float angle = uTime * vMotion.x + vSmoke.z * 6.28;
  vec3 curl = p;
  curl.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * curl.xz;
  float roll = -angle * .6 + sin(p.y * 2.4 + uTime * .43) * .22;
  curl.xy = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * curl.xy;
  vec2 noise = texture(uDensity, curl * 0.68 + flow).rg;
  // Broad cavities break the contour; small eddies erode it without photograph
  // grain, hard sprite borders or the repeated silhouette of an atlas stamp.
  float r2p = dot(p, p);
  float body = 1.04 - r2p;
  // 球面边上密度必须收到 0：否则噪声在边缘仍为正，被四边形的圆边硬切成一道道正圆弧
  float rim = 1.0 - smoothstep(0.28, 1.0, r2p);
  // 远景柱多一份侵蚀：圆边被撕成絮（vPlume.w = 0 时乘 1，逐比特不变）
  float erode = 1.0 + vPlume.w;
  float field = body + (noise.r - 0.5) * 1.2 * erode + (noise.g - 0.52) * 1.9 * erode;
  return smoothstep(-0.06, 0.62, field) * (0.75 + noise.g * 0.25) * rim;
}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 0.99 || vSmoke.x < 0.001) discard;
  float sceneDepth = uDepthValid > 0.5 ? texture(uNormalDepth, gl_FragCoord.xy / uResolution).w : 0.0;
  float halfRay = sqrt(max(0.0, 1.0 - r2));
  vec3 flow = vec3(vSmoke.z * 7.3, vSmoke.z * 3.7 - uTime * vMotion.y, vSmoke.z * 9.1);
  vec3 light = normalize(uSunDirection + vec3(0.0, 0.25, 0.0));
  vec3 base = vTint;
  // 远景柱：根部压黑（燃烧点的浓黑烟），越往上越被稀释成灰；受光面偏太阳色、背光面偏冷
  vec3 sunHue = vec3(1.0), skyHue = vec3(1.0);
  if (vPlume.z > 0.0) {
    float thin = smoothstep(0.08, 0.95, vSmoke.w);
    base = mix(vTint * (1.0 - vPlume.z), uPlumeDilute, clamp(thin * vPlume.z * 2.0, 0.0, 1.0));
    // 黄昏的太阳色很饱和，整根烟会染成酱红：先把太阳色的色度压掉三成再按 warm 混
    vec3 sunRaw = uSunColorFog / max(dot(uSunColorFog, vec3(0.2126, 0.7152, 0.0722)), 1.0e-3);
    sunHue = mix(vec3(1.0), mix(sunRaw, vec3(1.0), 0.3), uPlumeLight.x);
    skyHue = mix(vec3(1.0), vec3(0.90, 0.96, 1.08), uPlumeLight.y);
  }
  // 烟的光照是按白天标的绝对量，夜里（×2.7–3.6 的曝光）会整团发白。按本时段雾色（= 天光）的亮度
  // 往下压：白天各档 fog.sky 的亮度都在 0.55 以上，钳到 1 —— 白天逐比特不变；夜档约 0.12。
  float lightScale = min(1.0, dot(uFogColorSky, vec3(0.2126, 0.7152, 0.0722)) / 0.55);
  sunHue *= lightScale;
  skyHue *= lightScale;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < SMOKE_STEPS; i++) {
    float z = halfRay * (1.0 - 2.0 * (float(i) + 0.5) / float(SMOKE_STEPS));
    vec3 p = vRight * vUv.x + vUp * vUv.y + vToward * z;
    float density = Density(p, flow);
    float sampleDepth = vViewDepth - z * vRadius;
    if (sceneDepth > 0.001) density *= smoothstep(0.0, 0.85, sceneDepth - sampleDepth);
    // Integrate an approximate light path to the sphere boundary. Unlike a
    // nearly flat density gradient, this darkens thick cores while preserving
    // light around the rolling edges. Reuses the same second density sample.
    float alongLight = dot(p, light);
    float lightPath = max(0.0, sqrt(max(0.0, alongLight * alongLight + 1.0 - dot(p,p))) - alongLight);
    float lightDensity = (density + Density(p + light * lightPath * .5, flow)) * .5;
    // 多次散射的粗略补偿：厚芯不至于一团团发黑成豹斑
    float transmittance = mix(exp(-lightDensity * lightPath * uSmokeLighting.z), 1.0, 0.16);
    vec3 lit = base * (uSmokeLighting.x * skyHue + uSmokeLighting.y * transmittance * sunHue);
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
      uniforms: { ...shared, uDensity: { value: this.texture }, uSmokeLighting: { value: new THREE.Vector3(
        BATTLE_SMOKE_LIGHTING.ambient, BATTLE_SMOKE_LIGHTING.direct, BATTLE_SMOKE_LIGHTING.extinction) },
        uPlumeDilute: { value: new THREE.Vector3().fromArray(BATTLE_SMOKE_PLUME.dilute) },
        uPlumeLight: { value: new THREE.Vector2(BATTLE_SMOKE_PLUME.warm, BATTLE_SMOKE_PLUME.cool) },
        // 单测（Script_FirstLevelDistantSmokeTest）传空的 shared：给太阳色一个中性兜底
        uSunColorFog: shared.uSunColorFog || { value: new THREE.Vector3(1, 0.92, 0.78) },
        uFogColorSky: shared.uFogColorSky || { value: new THREE.Vector3(0.62, 0.64, 0.68) } },
      glslVersion: THREE.GLSL3,
      defines: { SMOKE_STEPS: (BATTLE_SMOKE_QUALITY[quality] || BATTLE_SMOKE_QUALITY.high).steps },
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
        ["iFlow","flow",4], ["iShape","shape",4], ["iLobe","lobe",4],
        ["iTint","tint",3], ["iMotion","motion",4], ["iPlume","plume",4]]) {
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
