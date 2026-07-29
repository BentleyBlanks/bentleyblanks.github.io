// 《燎原 · 敌后1937》 —— 特效与动画层。
//
// 职责：行军动画、游击战特效、天气、烟柱、飘字、扫荡箭头等一切时间相关的表现。
//
// 硬约束（性能）：
//   1. 粒子全部 GPU 驱动：THREE.Points + 自定义 ShaderMaterial，粒子的起点、速度、
//      寿命、延迟、大小、汇聚目标全部写进 attribute，每帧 JS 只更新 **一个** 共享
//      uTime uniform（所有粒子材质引用同一个 uniform 对象），绝不逐粒子遍历。
//   2. 发射器走对象池：一次性爆发（burst）与持续流（stream）分池，超出并发上限时
//      优雅回收最旧的一个。持续流用 shader 里的 mod(age, life) 自循环，零 CPU 开销。
//   3. **持久层一律合批**，drawcall 不随战局增长：
//      · 烟柱 / 余烬（SetSmoke，随战局不断累积、长期存在）不再各占一个发射器，
//        而是共用两块常驻 Points 批（浓烟一块、余烬一块），每根烟柱只占其中一段
//        slot。诞生时刻、浓度、上升速率、扰动强度改走 aBatch 顶点属性（BATCHED
//        分支），因此浓度分级与「随时间变灰」的既有表现一字不改，draw call 恒为 2。
//      · 建设脚手架（SpawnBuild）原先是 4 个 Group × 6 个独立 Mesh，24 个顶点一个
//        drawcall，战局中段能堆到 240 个；现在合成 **一个 InstancedMesh**（单位立方
//        体 + 逐实例矩阵 + 逐实例 aFade），并发多少座工地都只有 1 个 drawcall。
//      · 两者都配 slot 对象池：撤除时真正归还 slot 并压回高水位，不是只置 visible。
//   4. 持久层材质不参与 PBR：脚手架从 MeshStandardMaterial 换成不受光的自定义
//      ShaderMaterial（假明暗写在顶点法线里），少一套光照 shader program。
//   5. SetQuality 分级控制粒子上限、点光源数量、天气是否启用、并发工地数。
//
// 内容红线（规格书第 7 节）：特效只表现「隐蔽—突袭—转移」与「人民的组织」，
// 不做血腥、不渲染杀戮，爆点只表现破坏交通线，动员是本模块最该有感染力的一段。

import * as THREE from "three";
import { HexToWorld, ParseHexKey, HexLine, HexKey, hexSize, CreateRng, HashString, Clamp, Lerp, SmoothStep } from "./Script_Hex.mjs";
import { CreateWorkModel, CreateRailModel, TickModelWind } from "./Script_Models.mjs";

// --------------------------------------------------------------------------
// 质量分级预设
// --------------------------------------------------------------------------

const qualityPresets = {
  low: { particleScale: 0.34, burstEmitters: 8, lights: 0, weather: false, smokeColumns: 3, rings: 6, moves: 2, scaffolds: 4 },
  medium: { particleScale: 0.62, burstEmitters: 14, lights: 1, weather: true, smokeColumns: 5, rings: 10, moves: 3, scaffolds: 8 },
  high: { particleScale: 1, burstEmitters: 20, lights: 3, weather: true, smokeColumns: 8, rings: 14, moves: 5, scaffolds: 12 },
  ultra: { particleScale: 1.4, burstEmitters: 28, lights: 5, weather: true, smokeColumns: 12, rings: 18, moves: 8, scaffolds: 16 },
};

const emitterCapacity = 320;

// 持久层合批的静态预算：按最高画质一次性开好，切画质只收紧使用上限、不重建缓冲。
const smokeSlotLimit = qualityPresets.ultra.smokeColumns;
const smokeSlotCapacity = 132; // 单根浓烟最多占的粒子数：ultra 浓度 3 → round(92 × 1.4) = 129
const emberSlotCapacity = 36; // 单根余烬最多占的粒子数：ultra → round(20 × 1.4) = 28
const scaffoldSlotLimit = qualityPresets.ultra.scaffolds;
const scaffoldPiecesPerSite = 24; // 4 层 × （4 立柱 + 2 横杆）
const ringSlotLimit = qualityPresets.ultra.rings;
const sweepArrowLimit = 6; // 同屏最多几条扫荡箭头，超出的最旧一条提前收走

/** 脚手架单座工地的构件表：局部坐标 + 尺寸，逐实例矩阵由它和层缩放算出来。 */
const scaffoldLayout = (() => {
  const pieces = [];
  for (let level = 0; level < 4; level += 1) {
    for (const x of [-0.2, 0.2]) {
      for (const z of [-0.2, 0.2]) pieces.push({ level, x, y: 0.08, z, width: 0.02, height: 0.16, depth: 0.02 });
    }
    for (const z of [-0.2, 0.2]) pieces.push({ level, x: 0, y: 0.15, z, width: 0.44, height: 0.016, depth: 0.016 });
  }
  return pieces;
})();

// --------------------------------------------------------------------------
// 粒子 shader
// --------------------------------------------------------------------------

const particleVertexShader = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aVelocity;
attribute vec3 aTarget;
attribute float aSeed;
attribute float aDelay;
attribute float aLife;
attribute float aSize;
#ifdef BATCHED
  // 合批常驻发射器：逐粒子携带所属烟柱的 x = 诞生时刻 / y = 浓度 / z = 上升速率 / w = 扰动
  attribute vec4 aBatch;
  varying vec2 vBatch;
#endif
uniform float uTime;
uniform float uStart;
uniform vec3 uGravity;
uniform float uDrag;
uniform float uSwirl;
uniform float uTurbulence;
uniform float uRise;
uniform float uConverge;
uniform float uSizeScale;
uniform vec2 uSizeCurve;
uniform float uPixelRatio;
varying float vLife;
varying float vSeed;
void main() {
  #ifdef BATCHED
    float startTime = aBatch.x;
    float rise = aBatch.z;
    float turbulence = aBatch.w;
    vBatch = aBatch.xy;
  #else
    float startTime = uStart;
    float rise = uRise;
    float turbulence = uTurbulence;
  #endif
  float age = uTime - startTime - aDelay;
  #ifdef LOOPING
    age = mod( max( age, 0.0 ), aLife );
  #endif
  float life = clamp( age / aLife, 0.0, 1.0 );
  vLife = life;
  vSeed = aSeed;
  // 带阻力的解析积分：位移 = v0 * (1 - exp(-k t)) / k，避免逐帧积分
  float drag = max( uDrag, 0.0001 );
  float travel = ( 1.0 - exp( -drag * age ) ) / drag;
  vec3 offsetPosition = aOffset + aVelocity * travel + uGravity * ( 0.5 * age * age );
  float phase = aSeed * 6.2831853 + age * uSwirl;
  offsetPosition.x += sin( phase ) * turbulence * ( 0.35 + aSeed );
  offsetPosition.z += cos( phase * 1.13 ) * turbulence * ( 0.35 + aSeed );
  offsetPosition.y += rise * age;
  offsetPosition = mix( offsetPosition, aTarget, uConverge * smoothstep( 0.1, 0.92, life ) );
  vec4 viewPosition = modelViewMatrix * vec4( offsetPosition, 1.0 );
  gl_Position = projectionMatrix * viewPosition;
  float grow = mix( uSizeCurve.x, uSizeCurve.y, life );
  float visible = step( 0.0, uTime - startTime - aDelay );
  gl_PointSize = aSize * uSizeScale * grow * visible * uPixelRatio * ( 260.0 / max( -viewPosition.z, 0.001 ) );
}
`;

const particleFragmentShader = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uAshColor;
uniform float uOpacity;
uniform float uFade;
uniform float uTilt;
uniform float uLit;
uniform float uDaylight;
uniform float uTime;
uniform float uBirth;
varying float vLife;
varying float vSeed;
#ifdef BATCHED
  varying vec2 vBatch;
#endif
void main() {
  #ifdef BATCHED
    float birth = vBatch.x;
    float density = vBatch.y;
  #else
    float birth = uBirth;
    float density = 1.0;
  #endif
  vec2 point = gl_PointCoord - 0.5;
  #ifdef SHAPE_STREAK
    float ct = cos( uTilt );
    float st = sin( uTilt );
    point = vec2( point.x * ct - point.y * st, point.x * st + point.y * ct );
    point.x *= 6.5;
  #endif
  float distance = length( point );
  #ifdef SHAPE_SPARK
    float alpha = 1.0 - smoothstep( 0.04, 0.44, distance );
    alpha *= alpha;
  #else
    float alpha = 1.0 - smoothstep( 0.16, 0.5, distance );
    #ifdef SHAPE_PUFF
      alpha = pow( alpha, 1.55 ) * ( 0.72 + 0.28 * sin( vSeed * 31.0 + distance * 18.0 ) );
    #endif
  #endif
  float fade = smoothstep( 0.0, 0.07, vLife ) * ( 1.0 - smoothstep( uFade, 1.0, vLife ) );
  float columnAge = clamp( ( uTime - birth ) / 42.0, 0.0, 1.0 );
  vec3 color = mix( uColorA, uColorB, vLife );
  color = mix( color, uAshColor, columnAge * 0.75 );
  color *= mix( 1.0, uDaylight, uLit );
  gl_FragColor = vec4( color, alpha * fade * uOpacity * density );
  if ( gl_FragColor.a < 0.008 ) discard;
}
`;

const sweepVertexShader = /* glsl */ `
varying vec2 vRibbonUv;
void main() {
  vRibbonUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const sweepFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uRepeat;
uniform float uSpeed;
uniform float uOpacity;
uniform vec3 uColorCore;
uniform vec3 uColorEdge;
varying vec2 vRibbonUv;
void main() {
  float across = abs( vRibbonUv.y - 0.5 ) * 2.0;
  // 沿路径流动的 V 形箭头
  float flow = fract( vRibbonUv.x * uRepeat - uTime * uSpeed - across * 0.28 );
  float arrow = smoothstep( 0.55, 0.98, flow );
  float body = ( 1.0 - across * across ) * 0.42;
  float tail = smoothstep( 0.0, 0.12, vRibbonUv.x ) * ( 1.0 - smoothstep( 0.88, 1.0, vRibbonUv.x ) );
  float pulse = 0.72 + 0.28 * sin( uTime * 3.4 );
  float intensity = ( body + arrow * 0.85 ) * tail * pulse;
  vec3 color = mix( uColorEdge, uColorCore, arrow );
  gl_FragColor = vec4( color, clamp( intensity, 0.0, 1.0 ) * uOpacity );
  if ( gl_FragColor.a < 0.01 ) discard;
}
`;

// 脚手架合批：单位立方体 + 逐实例矩阵 + 逐实例淡出，不受光、不投影、不参与 PBR。
// 立面明暗直接由物体空间法线算（构件全是轴对齐盒子，逐实例缩放不改变法线朝向）。
const scaffoldVertexShader = /* glsl */ `
attribute float aFade;
varying float vFade;
varying float vShade;
void main() {
  vFade = aFade;
  vec3 lightDirection = normalize( vec3( 0.42, 0.86, 0.3 ) );
  vShade = 0.52 + 0.48 * ( dot( normal, lightDirection ) * 0.5 + 0.5 );
  #ifdef USE_INSTANCING
    vec4 localPosition = instanceMatrix * vec4( position, 1.0 );
  #else
    vec4 localPosition = vec4( position, 1.0 );
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * localPosition;
}
`;

const scaffoldFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uDaylight;
varying float vFade;
varying float vShade;
void main() {
  gl_FragColor = vec4( uColor * vShade * mix( 0.62, 1.0, uDaylight ), uOpacity * vFade );
  if ( gl_FragColor.a < 0.01 ) discard;
}
`;

// 冲击环合批：逐实例矩阵给缩放与落点，逐实例 aColor / aFade 给颜色与淡出。
const ringVertexShader = /* glsl */ `
attribute vec3 aColor;
attribute float aFade;
varying vec3 vRingColor;
varying float vRingFade;
void main() {
  vRingColor = aColor;
  vRingFade = aFade;
  #ifdef USE_INSTANCING
    vec4 localPosition = instanceMatrix * vec4( position, 1.0 );
  #else
    vec4 localPosition = vec4( position, 1.0 );
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * localPosition;
}
`;

const ringFragmentShader = /* glsl */ `
varying vec3 vRingColor;
varying float vRingFade;
void main() {
  gl_FragColor = vec4( vRingColor, vRingFade );
  if ( gl_FragColor.a < 0.01 ) discard;
}
`;

const fogVertexShader = /* glsl */ `
varying vec2 vFogUv;
void main() {
  vFogUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const fogFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uDrift;
uniform vec3 uColor;
varying vec2 vFogUv;
float FogHash( vec2 cell ) {
  return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float FogNoise( vec2 point ) {
  vec2 cell = floor( point );
  vec2 fraction = fract( point );
  vec2 smoothed = fraction * fraction * ( 3.0 - 2.0 * fraction );
  return mix( mix( FogHash( cell ), FogHash( cell + vec2( 1.0, 0.0 ) ), smoothed.x ),
              mix( FogHash( cell + vec2( 0.0, 1.0 ) ), FogHash( cell + vec2( 1.0, 1.0 ) ), smoothed.x ), smoothed.y );
}
void main() {
  vec2 drift = vec2( uTime * uDrift, uTime * uDrift * 0.37 );
  float value = FogNoise( vFogUv * 4.0 + drift ) * 0.6 + FogNoise( vFogUv * 9.0 - drift * 1.7 ) * 0.4;
  float edge = smoothstep( 0.0, 0.28, vFogUv.x ) * smoothstep( 1.0, 0.72, vFogUv.x );
  edge *= smoothstep( 0.0, 0.28, vFogUv.y ) * smoothstep( 1.0, 0.72, vFogUv.y );
  gl_FragColor = vec4( uColor, smoothstep( 0.34, 0.86, value ) * edge * uOpacity );
  if ( gl_FragColor.a < 0.01 ) discard;
}
`;

// --------------------------------------------------------------------------
// 工厂
// --------------------------------------------------------------------------

function EaseInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function EaseOutBack(t) {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

function ShortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * 创建特效句柄。
 * options: { quality, HeightAt(key), hexSize, seed, windStrength }
 */
export function CreateEffects(scene, camera, renderer, options = {}) {
  const root = new THREE.Group();
  root.name = "EffectsRoot";
  root.matrixAutoUpdate = true;
  if (scene) scene.add(root);

  const rng = CreateRng(HashString(String(options.seed ?? "effects1937")));
  const tileSize = options.hexSize ?? hexSize;
  let heightProvider = typeof options.HeightAt === "function" ? options.HeightAt : null;
  let quality = qualityPresets[options.quality] ? options.quality : "high";
  let preset = qualityPresets[quality];
  let clock = 0;
  let daylight = 1;
  let timeOfDay = 0.5;
  let disposed = false;
  const pixelRatio = renderer && typeof renderer.getPixelRatio === "function" ? Math.min(renderer.getPixelRatio(), 2) : 1;

  // 全局共享 uniform：每帧只写这一个
  const sharedTime = { value: 0 };
  const sharedDaylight = { value: 1 };
  const sharedPixelRatio = { value: pixelRatio };

  const tweens = [];
  const pendingResolvers = new Set();
  const disposables = new Set();
  const emitterPools = new Map();
  const smokeColumns = new Map();
  const sweepArrows = [];
  const textCache = new Map();
  const lightPool = [];
  const activeMoves = [];
  const activeScaffolds = [];
  const activeRings = [];
  const smokeBatches = { smoke: null, ember: null };
  const ringBatches = { additive: null, normal: null };
  let scaffoldBatch = null;
  let weather = { kind: "Clear", intensity: 0, active: null, fadingOut: [] };

  // ------------------------------------------------------------------------
  // 坐标工具
  // ------------------------------------------------------------------------

  function HeightOf(key) {
    if (!heightProvider) return 0;
    const value = heightProvider(key);
    return Number.isFinite(value) ? value : 0;
  }

  function WorldOf(key, lift = 0) {
    const hex = ParseHexKey(key);
    const world = HexToWorld(hex.q, hex.r, tileSize);
    return new THREE.Vector3(world.x, HeightOf(key) + lift, world.z);
  }

  function PathOf(fromKey, toKey, explicitKeys) {
    const keys = explicitKeys && explicitKeys.length > 1
      ? explicitKeys
      : HexLine(ParseHexKey(fromKey), ParseHexKey(toKey)).map((hex) => HexKey(hex.q, hex.r));
    return { keys, points: keys.map((key) => WorldOf(key, 0)) };
  }

  /** 极轻量补间：OnUpdate(t, dt) 每帧一次，OnDone 在 t 到 1 时一次。 */
  function AddTween(duration, OnUpdate, OnDone) {
    const tween = { elapsed: 0, duration: Math.max(duration, 0.001), OnUpdate, OnDone };
    tweens.push(tween);
    return tween;
  }

  /** 延时执行：特效分镜靠它把「晃动 → 闪光 → 烟尘 → 消失」串成时间线。 */
  function Delay(seconds, Action) {
    return AddTween(Math.max(seconds, 0.001), null, Action);
  }

  // ------------------------------------------------------------------------
  // 粒子发射器池
  // ------------------------------------------------------------------------

  function BuildEmitter(shape, looping) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(emitterCapacity * 3), 3));
    for (const [name, size] of [["aOffset", 3], ["aVelocity", 3], ["aTarget", 3], ["aSeed", 1], ["aDelay", 1], ["aLife", 1], ["aSize", 1]]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(emitterCapacity * size), size));
    }
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    const defines = { [`SHAPE_${shape}`]: "" };
    if (looping) defines.LOOPING = "";
    const material = new THREE.ShaderMaterial({
      defines,
      uniforms: {
        uTime: sharedTime,
        uDaylight: sharedDaylight,
        uPixelRatio: sharedPixelRatio,
        uStart: { value: 0 },
        uBirth: { value: 0 },
        uGravity: { value: new THREE.Vector3() },
        uDrag: { value: 1 },
        uSwirl: { value: 0 },
        uTurbulence: { value: 0 },
        uRise: { value: 0 },
        uConverge: { value: 0 },
        uSizeScale: { value: 1 },
        uSizeCurve: { value: new THREE.Vector2(1, 1) },
        uColorA: { value: new THREE.Color("#ffffff") },
        uColorB: { value: new THREE.Color("#ffffff") },
        uAshColor: { value: new THREE.Color("#8b8b8b") },
        uOpacity: { value: 1 },
        uFade: { value: 0.55 },
        uTilt: { value: 0 },
        uLit: { value: 1 },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 6;
    points.visible = false;
    root.add(points);
    disposables.add(geometry);
    disposables.add(material);
    return { points, geometry, material, busy: false, releaseAt: 0, epoch: 0, looping, shape };
  }

  /**
   * 每种「形状 × 是否循环」独立成池。
   * 爆发池按质量档总预算平摊到 4 种形状；持续流池现在只服务行军火把与天气——
   * 烟柱已经搬进常驻合批，不再和它们抢发射器，池子也就不必再按烟柱数放大。
   */
  function PoolLimit(looping) {
    if (looping) return preset.moves + 3;
    return Math.max(3, Math.ceil(preset.burstEmitters / 4));
  }

  function AcquireEmitter(shape, looping) {
    const key = `${shape}:${looping ? 1 : 0}`;
    let pool = emitterPools.get(key);
    if (!pool) {
      pool = [];
      emitterPools.set(key, pool);
    }
    for (const emitter of pool) {
      if (!emitter.busy) return emitter;
    }
    if (pool.length < PoolLimit(looping)) {
      const emitter = BuildEmitter(shape, looping);
      pool.push(emitter);
      return emitter;
    }
    // 超出并发上限：优雅丢弃最旧的一个（epoch 递增，旧句柄失效但不会误伤新主人）
    let oldest = pool[0];
    for (const emitter of pool) {
      if (emitter.releaseAt < oldest.releaseAt) oldest = emitter;
    }
    ReleaseEmitter(oldest);
    return oldest;
  }

  function ReleaseEmitter(emitter) {
    emitter.busy = false;
    emitter.epoch += 1;
    emitter.points.visible = false;
  }

  function RandomDirection(spec, index, count, target) {
    const kind = spec.direction || "sphere";
    if (kind === "up") {
      target.set((rng() - 0.5) * spec.spread, 1, (rng() - 0.5) * spec.spread).normalize();
    } else if (kind === "radial") {
      const angle = (index / count) * Math.PI * 2 + rng() * 0.6;
      target.set(Math.cos(angle), (spec.spread ?? 0.3) * rng(), Math.sin(angle)).normalize();
    } else if (kind === "cone") {
      const angle = rng() * Math.PI * 2;
      const lift = Lerp(1, 0.25, rng() * (spec.spread ?? 0.5));
      target.set(Math.cos(angle) * (1 - lift), lift, Math.sin(angle) * (1 - lift)).normalize();
    } else if (kind === "dome") {
      const angle = rng() * Math.PI * 2;
      const height = rng();
      target.set(Math.cos(angle) * (1 - height * 0.6), height, Math.sin(angle) * (1 - height * 0.6)).normalize();
    } else {
      target.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
    }
    return target;
  }

  /**
   * 把 count 个粒子写进 geometry 的 [base, base + count) 区间。
   * 独立发射器 base 恒为 0；合批发射器按 slot 起点写，互不干扰。
   * batchValues 非空时额外写 aBatch（诞生时刻 / 浓度 / 上升速率 / 扰动强度）。
   */
  function WriteParticles(geometry, base, count, spec, batchValues) {
    const offset = geometry.getAttribute("aOffset");
    const velocity = geometry.getAttribute("aVelocity");
    const targetAttribute = geometry.getAttribute("aTarget");
    const seed = geometry.getAttribute("aSeed");
    const delay = geometry.getAttribute("aDelay");
    const life = geometry.getAttribute("aLife");
    const size = geometry.getAttribute("aSize");
    const batch = batchValues ? geometry.getAttribute("aBatch") : null;
    const direction = new THREE.Vector3();
    const origin = spec.position || new THREE.Vector3();
    const convergeTarget = spec.target || origin;
    const radius = spec.radius ?? 0.1;
    const height = spec.height ?? 0.05;
    for (let index = 0; index < count; index += 1) {
      const slot = base + index;
      const angle = rng() * Math.PI * 2;
      const spot = radius * Math.sqrt(rng());
      offset.array[slot * 3] = origin.x + Math.cos(angle) * spot;
      offset.array[slot * 3 + 1] = origin.y + rng() * height + (spec.baseLift ?? 0);
      offset.array[slot * 3 + 2] = origin.z + Math.sin(angle) * spot;
      const speed = Lerp(spec.speed?.[0] ?? 0.2, spec.speed?.[1] ?? 0.6, rng());
      RandomDirection(spec, index, count, direction).multiplyScalar(speed);
      velocity.array[slot * 3] = direction.x;
      velocity.array[slot * 3 + 1] = direction.y;
      velocity.array[slot * 3 + 2] = direction.z;
      targetAttribute.array[slot * 3] = convergeTarget.x + (rng() - 0.5) * (spec.targetSpread ?? 0.14);
      targetAttribute.array[slot * 3 + 1] = convergeTarget.y + rng() * (spec.targetSpread ?? 0.14);
      targetAttribute.array[slot * 3 + 2] = convergeTarget.z + (rng() - 0.5) * (spec.targetSpread ?? 0.14);
      seed.array[slot] = rng();
      delay.array[slot] = Lerp(spec.delay?.[0] ?? 0, spec.delay?.[1] ?? 0, rng());
      life.array[slot] = Lerp(spec.life?.[0] ?? 0.8, spec.life?.[1] ?? 1.4, rng());
      size.array[slot] = Lerp(spec.size?.[0] ?? 6, spec.size?.[1] ?? 14, rng());
      if (batch) {
        batch.array[slot * 4] = batchValues[0];
        batch.array[slot * 4 + 1] = batchValues[1];
        batch.array[slot * 4 + 2] = batchValues[2];
        batch.array[slot * 4 + 3] = batchValues[3];
      }
    }
    const touched = [offset, velocity, targetAttribute, seed, delay, life, size];
    if (batch) touched.push(batch);
    for (const attribute of touched) attribute.needsUpdate = true;
  }

  /** 填充一个发射器的全部属性。仅在 spawn 时执行一次，不在每帧循环里。 */
  function FillEmitter(emitter, spec) {
    const count = Clamp(Math.round((spec.count || 40) * preset.particleScale), 4, emitterCapacity);
    const geometry = emitter.geometry;
    WriteParticles(geometry, 0, count, spec, null);
    const delay = geometry.getAttribute("aDelay");
    const life = geometry.getAttribute("aLife");
    geometry.setDrawRange(0, count);
    const uniforms = emitter.material.uniforms;
    uniforms.uStart.value = clock;
    uniforms.uBirth.value = spec.birth ?? clock;
    uniforms.uGravity.value.set(0, spec.gravity ?? 0, 0);
    uniforms.uDrag.value = spec.drag ?? 1.6;
    uniforms.uSwirl.value = spec.swirl ?? 0;
    uniforms.uTurbulence.value = spec.turbulence ?? 0;
    uniforms.uRise.value = spec.rise ?? 0;
    uniforms.uConverge.value = spec.converge ?? 0;
    uniforms.uSizeScale.value = spec.sizeScale ?? 1;
    uniforms.uSizeCurve.value.set(spec.sizeCurve?.[0] ?? 1, spec.sizeCurve?.[1] ?? 1);
    uniforms.uColorA.value.set(spec.colorA || "#cbbfa6");
    uniforms.uColorB.value.set(spec.colorB || spec.colorA || "#8d8574");
    uniforms.uAshColor.value.set(spec.ashColor || spec.colorB || "#8d8574");
    uniforms.uOpacity.value = spec.opacity ?? 0.85;
    uniforms.uFade.value = spec.fade ?? 0.45;
    uniforms.uTilt.value = spec.tilt ?? 0;
    uniforms.uLit.value = spec.lit ?? 1;
    emitter.material.blending = spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    emitter.material.needsUpdate = true;
    emitter.points.visible = true;
    emitter.points.position.set(0, 0, 0);
    emitter.busy = true;
    let longest = 0;
    for (let index = 0; index < count; index += 1) longest = Math.max(longest, delay.array[index] + life.array[index]);
    emitter.releaseAt = clock + longest + 0.05;
    return emitter;
  }

  /** 一次性粒子爆发。返回发射器句柄（一般无需持有）。 */
  function CreateParticleBurst(spec) {
    if (disposed) return null;
    const emitter = AcquireEmitter(spec.shape || "SOFT", false);
    return FillEmitter(emitter, spec);
  }

  /** 持续粒子流：shader 内自循环，回收前零 CPU 开销。句柄带 epoch 校验，被抢占后自动失效。 */
  function CreateParticleStream(spec) {
    if (disposed) return null;
    const emitter = AcquireEmitter(spec.shape || "PUFF", true);
    FillEmitter(emitter, spec);
    emitter.releaseAt = Infinity;
    const epoch = emitter.epoch;
    const alive = () => emitter.epoch === epoch && emitter.busy;
    return {
      emitter,
      points: emitter.points,
      IsAlive: alive,
      SetOpacity(value) { if (alive()) emitter.material.uniforms.uOpacity.value = value; },
      SetPosition(x, y, z) { if (alive()) emitter.points.position.set(x, y, z); },
      Release() { if (alive()) ReleaseEmitter(emitter); },
    };
  }

  // ------------------------------------------------------------------------
  // 持久特效合批：常驻粒子批 + slot 池
  //
  // 烟柱是战局里唯一会不断累积、长期存在的粒子特效。原先一根烟柱独占一个发射器，
  // 每根 = 1 个 draw call，还会跟天气、火把抢同一个 looping 池。现在改成两块常驻
  // 的 Points 批：浓烟一块、余烬一块，每根烟柱只占其中一段固定 slot，draw call
  // 恒为 2，且不再被别的系统抢占。
  // ------------------------------------------------------------------------

  /** 建一块常驻粒子批。slotSize × smokeSlotLimit 一次性开好，之后只改 slot 内的数据。 */
  function BuildParticleBatch(shape, slotSize, uniformSpec) {
    const total = slotSize * smokeSlotLimit;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(total * 3), 3));
    for (const [name, size] of [["aOffset", 3], ["aVelocity", 3], ["aTarget", 3], ["aSeed", 1], ["aDelay", 1], ["aLife", 1], ["aSize", 1], ["aBatch", 4]]) {
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(total * size), size));
    }
    // 空 slot 必须是惰性的：aLife 给 1 避免除零，aSize 给 0 让点尺寸退化为不占像素
    geometry.getAttribute("aLife").array.fill(1);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 120);
    const material = new THREE.ShaderMaterial({
      defines: { [`SHAPE_${shape}`]: "", LOOPING: "", BATCHED: "" },
      uniforms: {
        uTime: sharedTime,
        uDaylight: sharedDaylight,
        uPixelRatio: sharedPixelRatio,
        uStart: { value: 0 },
        uBirth: { value: 0 },
        uGravity: { value: new THREE.Vector3() },
        uDrag: { value: uniformSpec.drag },
        uSwirl: { value: uniformSpec.swirl },
        uTurbulence: { value: 0 },
        uRise: { value: 0 },
        uConverge: { value: 0 },
        uSizeScale: { value: 1 },
        uSizeCurve: { value: new THREE.Vector2(uniformSpec.sizeCurve[0], uniformSpec.sizeCurve[1]) },
        uColorA: { value: new THREE.Color(uniformSpec.colorA) },
        uColorB: { value: new THREE.Color(uniformSpec.colorB) },
        uAshColor: { value: new THREE.Color(uniformSpec.ashColor) },
        uOpacity: { value: 1 },
        uFade: { value: uniformSpec.fade },
        uTilt: { value: 0 },
        uLit: { value: uniformSpec.lit },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: uniformSpec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 6;
    points.visible = false;
    root.add(points);
    disposables.add(geometry);
    disposables.add(material);
    geometry.setDrawRange(0, 0);
    return { points, geometry, material, slotSize, owners: new Array(smokeSlotLimit).fill(null), generation: new Array(smokeSlotLimit).fill(0) };
  }

  function GetSmokeBatch(kind) {
    if (smokeBatches[kind]) return smokeBatches[kind];
    smokeBatches[kind] = kind === "ember"
      ? BuildParticleBatch("SPARK", emberSlotCapacity, {
        drag: 1.4, swirl: 2, sizeCurve: [1, 0.25], colorA: "#e8a352", colorB: "#7a3418",
        ashColor: "#7a3418", fade: 0.3, lit: 0, additive: true,
      })
      : BuildParticleBatch("PUFF", smokeSlotCapacity, {
        drag: 0.9, swirl: 0.65, sizeCurve: [0.35, 2.6], colorA: "#4a423a", colorB: "#9b968c",
        ashColor: "#a9a6a0", fade: 0.4, lit: 1, additive: false,
      });
    return smokeBatches[kind];
  }

  /** 重算批的绘制范围与可见性：高水位之外的 slot 连顶点都不过一遍。 */
  function RefreshBatchRange(batch) {
    let highWater = 0;
    for (let index = 0; index < batch.owners.length; index += 1) {
      if (batch.owners[index] !== null) highWater = (index + 1) * batch.slotSize;
    }
    batch.geometry.setDrawRange(0, highWater);
    batch.points.visible = highWater > 0;
  }

  /** 取一个空 slot；批已满则返回 -1（由调用方先腾位置）。 */
  function AcquireBatchSlot(batch, ownerKey, limit) {
    const usable = Math.min(limit, batch.owners.length);
    for (let index = 0; index < usable; index += 1) {
      if (batch.owners[index] === null) {
        batch.owners[index] = ownerKey;
        batch.generation[index] += 1;
        return index;
      }
    }
    return -1;
  }

  /**
   * 归还 slot：把整段粒子写成惰性状态（尺寸 0）并压回高水位，做到真回收而不是只藏起来。
   * generation 校验沿用发射器 epoch 的思路，防止过期句柄误释放新主人的 slot。
   */
  function ReleaseBatchSlot(batch, slotIndex, generation) {
    if (slotIndex < 0 || slotIndex >= batch.owners.length) return;
    if (batch.owners[slotIndex] === null) return;
    if (generation !== undefined && batch.generation[slotIndex] !== generation) return;
    const size = batch.geometry.getAttribute("aSize");
    const life = batch.geometry.getAttribute("aLife");
    const base = slotIndex * batch.slotSize;
    size.array.fill(0, base, base + batch.slotSize);
    life.array.fill(1, base, base + batch.slotSize);
    size.needsUpdate = true;
    life.needsUpdate = true;
    batch.owners[slotIndex] = null;
    RefreshBatchRange(batch);
  }

  /** 把一根烟柱写进 slot：超出实际用量的尾部一律清成惰性粒子。 */
  function WriteBatchSlot(batch, slotIndex, spec, batchValues) {
    const base = slotIndex * batch.slotSize;
    const count = Clamp(Math.round((spec.count || 40) * preset.particleScale), 4, batch.slotSize);
    WriteParticles(batch.geometry, base, count, spec, batchValues);
    if (count < batch.slotSize) {
      const size = batch.geometry.getAttribute("aSize");
      const life = batch.geometry.getAttribute("aLife");
      size.array.fill(0, base + count, base + batch.slotSize);
      life.array.fill(1, base + count, base + batch.slotSize);
    }
    RefreshBatchRange(batch);
  }

  // ------------------------------------------------------------------------
  // 脚手架合批（建设特效）
  //
  // 原先一座工地 = 4 个 Group × 6 个 Mesh，24 个顶点就要一个 draw call，
  // 战局中段能同时挂 40 个 Group / 240 个 Mesh。现在全部并进一个 InstancedMesh：
  // 无论同时几座工地，永远 1 个 draw call。
  // ------------------------------------------------------------------------

  function GetScaffoldBatch() {
    if (scaffoldBatch) return scaffoldBatch;
    const capacity = scaffoldSlotLimit * scaffoldPiecesPerSite;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    fade.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFade", fade);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color("#7a6242") },
        uOpacity: { value: 0.95 },
        uDaylight: sharedDaylight,
      },
      vertexShader: scaffoldVertexShader,
      fragmentShader: scaffoldFragmentShader,
      transparent: true,
      depthWrite: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    // 全部实例先塌成零体积，避免未占用的 slot 在原点留下一堆碎片
    for (let index = 0; index < capacity; index += 1) ClearScaffoldInstance(mesh, index);
    root.add(mesh);
    disposables.add(geometry);
    disposables.add(material);
    scaffoldBatch = { mesh, geometry, material, owners: new Array(scaffoldSlotLimit).fill(false), generation: new Array(scaffoldSlotLimit).fill(0) };
    return scaffoldBatch;
  }

  function ClearScaffoldInstance(mesh, instanceIndex) {
    const elements = mesh.instanceMatrix.array;
    const base = instanceIndex * 16;
    for (let offset = 0; offset < 16; offset += 1) elements[base + offset] = 0;
    elements[base + 15] = 1;
    mesh.geometry.getAttribute("aFade").array[instanceIndex] = 0;
  }

  /**
   * 写一座工地的 24 个构件。构件全是轴对齐盒子且不旋转，直接摊平写 16 个矩阵元素，
   * 比走 Object3D.updateMatrix 便宜一个数量级。layerScales 是四层各自的生长系数。
   * layerScales 为 0 表示该层还没长出来（对应原先的 layer.visible = false）。
   * generation 校验保证被提前收走的工地不会再往已经易主的 slot 里写东西。
   */
  function WriteScaffoldSite(slotIndex, generation, center, layerScales, fadeValue) {
    const batch = GetScaffoldBatch();
    if (!batch.owners[slotIndex] || batch.generation[slotIndex] !== generation) return;
    const elements = batch.mesh.instanceMatrix.array;
    const fade = batch.geometry.getAttribute("aFade").array;
    const instanceBase = slotIndex * scaffoldPiecesPerSite;
    for (let piece = 0; piece < scaffoldLayout.length; piece += 1) {
      const part = scaffoldLayout[piece];
      const raw = layerScales[part.level];
      const grow = raw > 0 ? Math.max(0.02, raw) : 0;
      const base = (instanceBase + piece) * 16;
      elements[base] = part.width;
      elements[base + 1] = 0; elements[base + 2] = 0; elements[base + 3] = 0;
      elements[base + 4] = 0;
      elements[base + 5] = part.height * grow;
      elements[base + 6] = 0; elements[base + 7] = 0;
      elements[base + 8] = 0; elements[base + 9] = 0;
      elements[base + 10] = part.depth;
      elements[base + 11] = 0;
      elements[base + 12] = center.x + part.x;
      elements[base + 13] = center.y + part.level * 0.16 + part.y * grow;
      elements[base + 14] = center.z + part.z;
      elements[base + 15] = 1;
      fade[instanceBase + piece] = grow > 0 ? fadeValue : 0;
    }
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.geometry.getAttribute("aFade").needsUpdate = true;
  }

  function RefreshScaffoldRange() {
    if (!scaffoldBatch) return;
    let highWater = 0;
    for (let index = 0; index < scaffoldBatch.owners.length; index += 1) {
      if (scaffoldBatch.owners[index]) highWater = (index + 1) * scaffoldPiecesPerSite;
    }
    scaffoldBatch.mesh.count = highWater;
    scaffoldBatch.mesh.visible = highWater > 0;
  }

  function AcquireScaffoldSlot() {
    const batch = GetScaffoldBatch();
    const usable = Math.min(preset.scaffolds, batch.owners.length);
    for (let index = 0; index < usable; index += 1) {
      if (!batch.owners[index]) {
        batch.owners[index] = true;
        batch.generation[index] += 1;
        RefreshScaffoldRange();
        return { index, generation: batch.generation[index] };
      }
    }
    return null;
  }

  /** 归还工地 slot：构件真正塌成零体积并压回 instanceCount，重复归还是安全的空操作。 */
  function ReleaseScaffoldSlot(slotIndex, generation) {
    if (!scaffoldBatch || slotIndex < 0 || !scaffoldBatch.owners[slotIndex]) return;
    if (generation !== undefined && scaffoldBatch.generation[slotIndex] !== generation) return;
    const instanceBase = slotIndex * scaffoldPiecesPerSite;
    for (let piece = 0; piece < scaffoldPiecesPerSite; piece += 1) ClearScaffoldInstance(scaffoldBatch.mesh, instanceBase + piece);
    scaffoldBatch.mesh.instanceMatrix.needsUpdate = true;
    scaffoldBatch.geometry.getAttribute("aFade").needsUpdate = true;
    scaffoldBatch.owners[slotIndex] = false;
    RefreshScaffoldRange();
  }

  // ------------------------------------------------------------------------
  // 冲击环 / 光环合批
  //
  // 冲击环原先是一环一个 Mesh，最多能同时挂 preset.rings 个 draw call。现在按
  // 混合模式各合成一个 InstancedMesh（实战只会用到叠加那一个），环数再多也只有
  // 1 个 draw call；颜色与淡出走逐实例属性，逐环的表现一点没变。
  // ------------------------------------------------------------------------

  const ringColorScratch = new THREE.Color();

  function GetRingBatch(additive) {
    const kind = additive ? "additive" : "normal";
    if (ringBatches[kind]) return ringBatches[kind];
    const geometry = new THREE.RingGeometry(0.62, 1, 36);
    geometry.rotateX(-Math.PI / 2);
    const color = new THREE.InstancedBufferAttribute(new Float32Array(ringSlotLimit * 3), 3);
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(ringSlotLimit), 1);
    color.setUsage(THREE.DynamicDrawUsage);
    fade.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aColor", color);
    geometry.setAttribute("aFade", fade);
    const material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: ringVertexShader,
      fragmentShader: ringFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, ringSlotLimit);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.count = 0;
    mesh.visible = false;
    for (let index = 0; index < ringSlotLimit; index += 1) ClearRingInstance(mesh, index);
    root.add(mesh);
    disposables.add(geometry);
    disposables.add(material);
    ringBatches[kind] = { mesh, geometry, material, owners: new Array(ringSlotLimit).fill(false), generation: new Array(ringSlotLimit).fill(0) };
    return ringBatches[kind];
  }

  function ClearRingInstance(mesh, instanceIndex) {
    const elements = mesh.instanceMatrix.array;
    const base = instanceIndex * 16;
    for (let offset = 0; offset < 16; offset += 1) elements[base + offset] = 0;
    elements[base + 15] = 1;
    mesh.geometry.getAttribute("aFade").array[instanceIndex] = 0;
  }

  function RefreshRingRange(batch) {
    let highWater = 0;
    for (let index = 0; index < batch.owners.length; index += 1) {
      if (batch.owners[index]) highWater = index + 1;
    }
    batch.mesh.count = highWater;
    batch.mesh.visible = highWater > 0;
  }

  function ReleaseRingSlot(batch, slotIndex, generation) {
    if (!batch || slotIndex < 0 || !batch.owners[slotIndex]) return;
    if (generation !== undefined && batch.generation[slotIndex] !== generation) return;
    ClearRingInstance(batch.mesh, slotIndex);
    batch.mesh.instanceMatrix.needsUpdate = true;
    batch.geometry.getAttribute("aFade").needsUpdate = true;
    batch.owners[slotIndex] = false;
    RefreshRingRange(batch);
  }

  /** 冲击环：地面上扩散一圈的暖色光晕。返回句柄仅供调用方提前收环。 */
  function SpawnRing(position, spec = {}) {
    if (disposed) return null;
    // 同屏环数仍按画质分级封顶，超出时把最旧的一环提前收走
    while (activeRings.length >= preset.rings) {
      const oldest = activeRings.shift();
      if (oldest && oldest.Finish) oldest.Finish();
    }
    const additive = spec.additive !== false;
    const batch = GetRingBatch(additive);
    let slotIndex = -1;
    const usable = Math.min(preset.rings, ringSlotLimit);
    for (let index = 0; index < usable; index += 1) {
      if (!batch.owners[index]) { slotIndex = index; break; }
    }
    if (slotIndex < 0) return null;
    batch.owners[slotIndex] = true;
    batch.generation[slotIndex] += 1;
    const generation = batch.generation[slotIndex];
    RefreshRingRange(batch);
    ringColorScratch.set(spec.color || "#c9b58a");
    const colorArray = batch.geometry.getAttribute("aColor").array;
    colorArray[slotIndex * 3] = ringColorScratch.r;
    colorArray[slotIndex * 3 + 1] = ringColorScratch.g;
    colorArray[slotIndex * 3 + 2] = ringColorScratch.b;
    batch.geometry.getAttribute("aColor").needsUpdate = true;
    // 落点在生成时就取值定死，避免调用方之后复用同一个 Vector3 把环拖走
    const centerX = position.x;
    const centerY = position.y + (spec.lift ?? 0.03);
    const centerZ = position.z;
    const from = spec.from ?? 0.15;
    const to = spec.to ?? 0.85;
    const duration = spec.duration ?? 0.7;
    const opacity = spec.opacity ?? 0.6;
    const record = { Finish: null };
    activeRings.push(record);
    const Retire = () => {
      ReleaseRingSlot(batch, slotIndex, generation);
      const index = activeRings.indexOf(record);
      if (index >= 0) activeRings.splice(index, 1);
    };
    const tween = AddTween(duration, (t) => {
      if (!batch.owners[slotIndex] || batch.generation[slotIndex] !== generation) return;
      const eased = 1 - Math.pow(1 - t, 2.2);
      const scale = Lerp(from, to, eased);
      const elements = batch.mesh.instanceMatrix.array;
      const base = slotIndex * 16;
      elements[base] = scale;
      elements[base + 5] = 1;
      elements[base + 10] = scale;
      elements[base + 12] = centerX;
      elements[base + 13] = centerY;
      elements[base + 14] = centerZ;
      elements[base + 15] = 1;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.geometry.getAttribute("aFade").array[slotIndex] = opacity * (1 - SmoothStep(spec.holdUntil ?? 0.25, 1, t));
      batch.geometry.getAttribute("aFade").needsUpdate = true;
    }, Retire);
    record.Finish = () => {
      tween.elapsed = tween.duration;
      Retire();
    };
    return record;
  }

  // ------------------------------------------------------------------------
  // 点光源池（夜间火把、爆点闪光）
  // ------------------------------------------------------------------------

  function AcquireLight(color, intensity, distance) {
    if (preset.lights <= 0) return null;
    for (const entry of lightPool) {
      if (!entry.busy) {
        entry.busy = true;
        entry.light.visible = true;
        entry.light.color.set(color);
        entry.light.intensity = intensity;
        entry.light.distance = distance;
        return entry;
      }
    }
    if (lightPool.length >= preset.lights) return null;
    const light = new THREE.PointLight(new THREE.Color(color), intensity, distance, 2);
    light.castShadow = false;
    root.add(light);
    const entry = { light, busy: true, flicker: rng() * 10, baseIntensity: intensity };
    lightPool.push(entry);
    return entry;
  }

  function ReleaseLight(entry) {
    if (!entry) return;
    entry.busy = false;
    entry.light.visible = false;
  }

  // ------------------------------------------------------------------------
  // 行军动画
  // ------------------------------------------------------------------------

  /** 沿 HexLine 路径移动单位：缓动 + 转向 + 起伏 + 扬尘拖尾 +（夜间）火把。 */
  function SpawnUnitMove(fromKey, toKey, unitObject, moveOptions = {}) {
    if (disposed || !unitObject) return Promise.resolve();
    while (activeMoves.length >= preset.moves) {
      const oldest = activeMoves.shift();
      if (oldest && oldest.Finish) oldest.Finish();
    }
    const { points } = PathOf(fromKey, toKey, moveOptions.pathKeys);
    if (points.length < 2) points.push(points[0].clone().add(new THREE.Vector3(0.02, 0, 0.02)));
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
    const totalLength = curve.getLength();
    const speed = moveOptions.speed ?? 1.55;
    const duration = Clamp(totalLength / speed, 0.45, 6);
    const climb = Math.abs(points[points.length - 1].y - points[0].y);
    const isNight = moveOptions.night ?? (timeOfDay < 0.22 || timeOfDay > 0.8);
    const lift = moveOptions.lift ?? 0;
    const sampled = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    let dustTimer = 0;
    let torchLight = null;
    let torchStream = null;
    if (isNight) {
      torchLight = AcquireLight("#e0a052", 2.4, 3.2);
      torchStream = CreateParticleStream({
        position: new THREE.Vector3(), shape: "SPARK", additive: true, count: 26, radius: 0.05, height: 0.02,
        speed: [0.05, 0.16], direction: "up", spread: 0.5, life: [0.5, 1], size: [3, 7], drag: 2.4, rise: 0.22,
        turbulence: 0.03, swirl: 2.4, colorA: "#f0b563", colorB: "#8c4a1e", opacity: 0.85, fade: 0.35, lit: 0,
        sizeCurve: [1.1, 0.2],
      });
    }
    let resolveMove = null;
    const promise = new Promise((resolve) => { resolveMove = resolve; });
    pendingResolvers.add(resolveMove);

    const record = { Finish: null };
    const tween = AddTween(duration, (t, dt) => {
      const eased = EaseInOutCubic(t);
      curve.getPoint(eased, sampled);
      curve.getTangent(Clamp(eased, 0.001, 0.999), tangent);
      // 山地爬升起伏：脚步节奏的小幅上下 + 上坡时前倾
      const stride = Math.sin(eased * totalLength * 5.5) * 0.012 * (1 + climb);
      unitObject.position.set(sampled.x, sampled.y + lift + Math.abs(stride), sampled.z);
      const facing = Math.atan2(tangent.x, tangent.z);
      const turnRate = 1 - Math.exp(-9 * dt);
      unitObject.rotation.y += ShortestAngle(unitObject.rotation.y, facing) * turnRate;
      unitObject.rotation.x = Lerp(unitObject.rotation.x, Clamp(-tangent.y * 0.5, -0.22, 0.22), turnRate);
      dustTimer += dt;
      if (t < 0.97 && dustTimer > 0.2) {
        dustTimer = 0;
        CreateParticleBurst({
          position: unitObject.position.clone().setY(unitObject.position.y + 0.01), shape: "PUFF", count: 12,
          radius: 0.06, height: 0.02, speed: [0.06, 0.2], direction: "dome", spread: 0.6, life: [0.5, 1.1],
          size: [10, 20], drag: 3.2, gravity: -0.02, rise: 0.05, turbulence: 0.02, colorA: "#b6a684",
          colorB: "#8a8071", opacity: 0.34, fade: 0.12, sizeCurve: [0.5, 1.7],
        });
      }
      if (torchLight) {
        torchLight.light.position.set(unitObject.position.x, unitObject.position.y + 0.42, unitObject.position.z);
        torchLight.light.intensity = torchLight.baseIntensity * (0.78 + 0.22 * Math.sin(clock * 11 + torchLight.flicker));
      }
      if (torchStream) torchStream.SetPosition(unitObject.position.x, unitObject.position.y + 0.36, unitObject.position.z);
    }, () => {
      const end = points[points.length - 1];
      unitObject.position.set(end.x, end.y + lift, end.z);
      unitObject.rotation.x = 0;
      ReleaseLight(torchLight);
      if (torchStream) torchStream.Release();
      const index = activeMoves.indexOf(record);
      if (index >= 0) activeMoves.splice(index, 1);
      pendingResolvers.delete(resolveMove);
      resolveMove();
    });
    record.Finish = () => { tween.elapsed = tween.duration; };
    activeMoves.push(record);
    return promise;
  }

  /** 地道转移：地表下的土包移动 + 沿途细小土屑，出入口各一次扬尘。 */
  function SpawnTunnelTravel(fromKey, toKey) {
    if (disposed) return Promise.resolve();
    const { points } = PathOf(fromKey, toKey);
    if (points.length < 2) points.push(points[0].clone().add(new THREE.Vector3(0.02, 0, 0.02)));
    const start = points[0];
    const end = points[points.length - 1];
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
    const mound = CreateWorkModel("Tunnel", { scale: 0.42 });
    mound.position.copy(start).setY(start.y - 0.05);
    root.add(mound);
    const duration = Clamp(curve.getLength() / 2.4, 0.5, 3.2);
    const sampled = new THREE.Vector3();
    let puffTimer = 0;
    CreateParticleBurst({ position: start.clone(), shape: "PUFF", count: 20, radius: 0.12, speed: [0.1, 0.3], direction: "dome", life: [0.5, 1], size: [12, 22], drag: 3, colorA: "#9c8a68", colorB: "#7a6d55", opacity: 0.5, sizeCurve: [0.6, 1.6] });
    let resolveTravel = null;
    const promise = new Promise((resolve) => { resolveTravel = resolve; });
    pendingResolvers.add(resolveTravel);
    AddTween(duration, (t, dt) => {
      curve.getPoint(EaseInOutCubic(t), sampled);
      mound.position.set(sampled.x, sampled.y - 0.045 + Math.sin(t * 22) * 0.006, sampled.z);
      puffTimer += dt;
      if (puffTimer > 0.28) {
        puffTimer = 0;
        CreateParticleBurst({ position: sampled.clone(), shape: "PUFF", count: 8, radius: 0.05, speed: [0.04, 0.14], direction: "up", spread: 0.8, life: [0.4, 0.8], size: [7, 13], drag: 3.4, colorA: "#8f8064", colorB: "#6f6552", opacity: 0.28, sizeCurve: [0.5, 1.3] });
      }
    }, () => {
      root.remove(mound);
      CreateParticleBurst({ position: end.clone(), shape: "PUFF", count: 24, radius: 0.14, speed: [0.12, 0.34], direction: "dome", life: [0.6, 1.2], size: [12, 24], drag: 2.8, colorA: "#a2906c", colorB: "#7a6d55", opacity: 0.5, sizeCurve: [0.6, 1.8] });
      pendingResolvers.delete(resolveTravel);
      resolveTravel();
    });
    return promise;
  }

  // ------------------------------------------------------------------------
  // 游击战特效
  // ------------------------------------------------------------------------

  /** 伏击：草木晃动 → 短促枪口闪光 → 烟尘扩散 → 目标震动 → 迅速隐没。 */
  function SpawnAmbush(key, ambushOptions = {}) {
    if (disposed) return;
    const center = WorldOf(key, 0);
    // 1. 草木晃动：贴地的碎叶被惊起
    CreateParticleBurst({
      position: center.clone(), shape: "STREAK", count: 34, radius: 0.42, height: 0.06, speed: [0.15, 0.5],
      direction: "dome", spread: 0.8, life: [0.35, 0.75], size: [5, 11], drag: 4.5, gravity: -0.25, swirl: 5,
      turbulence: 0.05, tilt: 0.6, colorA: "#68764a", colorB: "#7d7343", opacity: 0.55, fade: 0.3, sizeCurve: [1, 0.6],
    });
    // 2. 枪口闪光：靠 aDelay 做 4 次错开的极短促爆闪，全在同一个发射器里
    CreateParticleBurst({
      position: center.clone(), shape: "SPARK", additive: true, count: 26, radius: 0.34, height: 0.16,
      speed: [0.05, 0.2], direction: "sphere", life: [0.07, 0.12], size: [16, 30], drag: 6, delay: [0.22, 0.52],
      colorA: "#ecd2a2", colorB: "#c8863a", opacity: 0.82, fade: 0.05, lit: 0, sizeCurve: [1.3, 0.3],
    });
    const flashLight = AcquireLight("#ffd79a", 0, 2.6);
    if (flashLight) {
      flashLight.light.position.copy(center).setY(center.y + 0.2);
      AddTween(0.55, (t) => {
        const pop = Math.max(0, Math.sin(t * Math.PI * 6)) * (1 - t);
        flashLight.light.intensity = pop * 3.4;
      }, () => ReleaseLight(flashLight));
    }
    // 3. 烟尘扩散：粒子自带 0.24-0.5 秒的 aDelay，正好跟在枪口闪光之后
    CreateParticleBurst({
      position: center.clone(), shape: "PUFF", count: 46, radius: 0.28, height: 0.1, speed: [0.18, 0.55],
      direction: "dome", spread: 0.7, life: [0.9, 1.7], size: [16, 34], drag: 2.4, rise: 0.1, swirl: 1.2,
      turbulence: 0.06, delay: [0.24, 0.5], colorA: "#b8ab90", colorB: "#7e7768", opacity: 0.42, fade: 0.25,
      sizeCurve: [0.4, 2.1],
    });
    Delay(0.3, () => {
      SpawnRing(center, { color: "#d9c69c", from: 0.12, to: 0.62, duration: 0.55, opacity: 0.42, holdUntil: 0.1 });
    });
    // 4. 目标标记震动
    const shakeTarget = ambushOptions.targetObject;
    if (shakeTarget) {
      const origin = shakeTarget.position.clone();
      AddTween(0.7, (t) => {
        const amount = (1 - t) * 0.035 * Math.sin(t * 52);
        shakeTarget.position.set(origin.x + amount, origin.y + Math.abs(amount) * 0.5, origin.z - amount * 0.7);
      }, () => shakeTarget.position.copy(origin));
    }
    // 5. 转移：一团暗尘把现场吞掉，强调「突然—短促—消失」
    Delay(0.9, () => {
      CreateParticleBurst({
        position: center.clone(), shape: "PUFF", count: 28, radius: 0.36, height: 0.12, speed: [0.05, 0.18],
        direction: "dome", life: [0.8, 1.4], size: [20, 40], drag: 3.2, rise: 0.04, colorA: "#6f6a5e",
        colorB: "#54513f", opacity: 0.3, fade: 0.1, sizeCurve: [0.8, 1.6],
      });
    });
  }

  /** 破袭：冲击环 + 碎石抛射 + 尘柱升腾 + 轨条几何弯折。 */
  function SpawnSabotage(key, sabotageOptions = {}) {
    if (disposed) return;
    const center = WorldOf(key, 0);
    SpawnRing(center, { color: "#f0d9a4", from: 0.08, to: 1.15, duration: 0.5, opacity: 0.75, holdUntil: 0.05 });
    SpawnRing(center, { color: "#b08a4e", from: 0.2, to: 1.6, duration: 1.1, opacity: 0.3, holdUntil: 0.1 });
    CreateParticleBurst({
      position: center.clone(), shape: "SPARK", additive: true, count: 18, radius: 0.05, height: 0.05,
      speed: [0.6, 1.6], direction: "dome", life: [0.1, 0.22], size: [18, 40], drag: 5, colorA: "#e8d0a0",
      colorB: "#e08a34", opacity: 1, fade: 0.02, lit: 0, sizeCurve: [1.4, 0.2],
    });
    // 碎石抛射（弹道 + 重力）
    CreateParticleBurst({
      position: center.clone(), shape: "SOFT", count: 40, radius: 0.08, height: 0.05, speed: [0.9, 2.4],
      direction: "dome", spread: 0.9, life: [0.7, 1.3], size: [4, 9], drag: 0.5, gravity: -3.6,
      colorA: "#7c6d55", colorB: "#544a3a", opacity: 0.85, fade: 0.7, sizeCurve: [1, 0.75],
    });
    // 尘柱升腾
    CreateParticleBurst({
      position: center.clone(), shape: "PUFF", count: 60, radius: 0.16, height: 0.08, speed: [0.2, 0.7],
      direction: "cone", spread: 0.35, life: [1.4, 2.6], size: [22, 46], drag: 1.5, rise: 0.5, swirl: 1.1,
      turbulence: 0.1, delay: [0, 0.35], colorA: "#c0b294", colorB: "#7d7466", opacity: 0.5, fade: 0.3,
      sizeCurve: [0.35, 2.6],
    });
    // 轨条弯折：克隆一份独立几何体做顶点形变，绝不动共享缓存
    const neighborKey = sabotageOptions.toKey || NeighborKeyOf(key);
    const railProp = CreateRailModel(key, neighborKey, 0);
    const railMesh = railProp.children[0];
    if (railMesh) {
      const bentGeometry = railMesh.geometry.clone();
      railMesh.geometry = bentGeometry;
      const original = bentGeometry.getAttribute("position").array.slice();
      railProp.position.y = center.y + 0.005;
      root.add(railProp);
      AddTween(2.8, (t) => {
        const bend = Math.min(1, t / 0.16) * (1 - SmoothStep(0.75, 1, t));
        const array = bentGeometry.getAttribute("position").array;
        for (let index = 0; index < array.length; index += 3) {
          const x = original[index];
          const falloff = Math.exp(-(x * x) * 26);
          array[index] = x * (1 + falloff * 0.1 * bend);
          array[index + 1] = original[index + 1] + falloff * 0.13 * bend;
          array[index + 2] = original[index + 2] * (1 + falloff * 1.5 * bend) + falloff * 0.05 * bend * Math.sign(original[index + 2] || 1);
        }
        bentGeometry.getAttribute("position").needsUpdate = true;
        if (t > 0.82) railProp.position.y = center.y + 0.005 - (t - 0.82) * 0.9;
      }, () => {
        root.remove(railProp);
        bentGeometry.dispose();
      });
    }
    const blastLight = AcquireLight("#ffcf8a", 0, 4.5);
    if (blastLight) {
      blastLight.light.position.copy(center).setY(center.y + 0.3);
      AddTween(0.4, (t) => { blastLight.light.intensity = (1 - t) * (1 - t) * 6; }, () => ReleaseLight(blastLight));
    }
  }

  function NeighborKeyOf(key) {
    const hex = ParseHexKey(key);
    return HexKey(hex.q + 1, hex.r);
  }

  /** 缴获：武器箱升起 + 金色飘字，强调「补给来自战场」而非战果炫耀。 */
  function SpawnCapture(key, captureOptions = {}) {
    if (disposed) return;
    const center = WorldOf(key, 0);
    const crate = CreateWorkModel("Cache", { scale: 0.62 });
    crate.position.copy(center).setY(center.y - 0.12);
    root.add(crate);
    CreateParticleBurst({
      position: center.clone(), shape: "PUFF", count: 18, radius: 0.14, speed: [0.08, 0.24], direction: "dome",
      life: [0.6, 1.1], size: [12, 24], drag: 3, colorA: "#a89a7c", colorB: "#7c7462", opacity: 0.4, sizeCurve: [0.5, 1.6],
    });
    CreateParticleBurst({
      position: center.clone(), shape: "SPARK", additive: true, count: 22, radius: 0.16, height: 0.1,
      speed: [0.12, 0.4], direction: "up", spread: 0.9, life: [0.7, 1.3], size: [6, 12], drag: 2.2, rise: 0.16,
      delay: [0.1, 0.5], colorA: "#f2d493", colorB: "#b98b3c", opacity: 0.9, fade: 0.4, lit: 0, sizeCurve: [0.6, 1.1],
    });
    AddTween(1.9, (t) => {
      const rise = t < 0.45 ? EaseOutBack(t / 0.45) : 1;
      crate.position.y = center.y - 0.12 + rise * 0.2;
      crate.rotation.y = t * 0.9;
      if (t > 0.72) crate.position.y -= (t - 0.72) * 0.4;
    }, () => root.remove(crate));
    SpawnFloatingText(key, captureOptions.text || "缴获", captureOptions.color || "#e8c67a");
  }

  /**
   * 动员：村庄上方升起点阵人群与灯火，向根据地方向汇聚。
   * 这是本作最该有感染力的一段——先零星，后成片，最后汇成一股。
   */
  function SpawnMobilize(key, mobilizeOptions = {}) {
    if (disposed) return;
    const center = WorldOf(key, 0);
    const gather = mobilizeOptions.towardKey ? WorldOf(mobilizeOptions.towardKey, 0.5) : center.clone().setY(center.y + 0.85);
    SpawnRing(center, { color: "#d8a860", from: 0.2, to: 1.25, duration: 1.6, opacity: 0.34, holdUntil: 0.35 });
    // 人群点阵：错开的 aDelay 让人一个一个地出现，而不是一次炸开
    CreateParticleBurst({
      position: center.clone(), shape: "SOFT", additive: true, count: 150, radius: 0.78, height: 0.02,
      baseLift: 0.02, speed: [0.05, 0.16], direction: "up", spread: 0.35, life: [2, 3], size: [4, 8],
      drag: 1.1, rise: 0.16, swirl: 0.7, turbulence: 0.03, delay: [0, 1.5], target: gather, converge: 0.85,
      targetSpread: 0.3, colorA: "#e8c07a", colorB: "#c8823c", opacity: 0.75, fade: 0.62, lit: 0, sizeCurve: [0.3, 1],
    });
    // 灯火：更大更亮的少数几点，走在人群前面
    CreateParticleBurst({
      position: center.clone(), shape: "SOFT", additive: true, count: 22, radius: 0.6, height: 0.05,
      baseLift: 0.1, speed: [0.04, 0.12], direction: "up", spread: 0.3, life: [2.2, 3.2], size: [14, 26],
      drag: 1, rise: 0.2, swirl: 1.4, turbulence: 0.05, delay: [0, 1.1], target: gather, converge: 0.9,
      targetSpread: 0.22, colorA: "#f4cf8c", colorB: "#d08c3e", opacity: 0.6, fade: 0.55, lit: 0, sizeCurve: [0.5, 1.2],
    });
    // 汇聚成一束的暖光柱
    const beamGeometry = new THREE.CylinderGeometry(0.06, 0.5, 1.1, 14, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: "#e0ab5e", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.copy(center).setY(center.y + 0.55);
    beam.renderOrder = 5;
    root.add(beam);
    AddTween(2.9, (t) => {
      beamMaterial.opacity = Math.sin(Clamp(t, 0, 1) * Math.PI) * 0.16;
      beam.scale.setScalar(Lerp(0.8, 1.25, t));
    }, () => {
      root.remove(beam);
      beamGeometry.dispose();
      beamMaterial.dispose();
    });
    const warmLight = AcquireLight("#f0b565", 0, 4);
    if (warmLight) {
      warmLight.light.position.copy(center).setY(center.y + 0.5);
      AddTween(2.6, (t) => { warmLight.light.intensity = Math.sin(t * Math.PI) * 2.2; }, () => ReleaseLight(warmLight));
    }
  }

  /** 建设：夯土扬尘（有节奏的四次夯击）+ 脚手架逐层升起。 */
  function SpawnBuild(key) {
    if (disposed) return;
    const center = WorldOf(key, 0);
    CreateParticleBurst({
      position: center.clone(), shape: "PUFF", count: 56, radius: 0.24, height: 0.02, speed: [0.15, 0.45],
      direction: "dome", spread: 0.7, life: [0.6, 1.1], size: [12, 26], drag: 3.4, rise: 0.05,
      delay: [0, 1.45], colorA: "#bdae8d", colorB: "#8d8471", opacity: 0.42, fade: 0.25, sizeCurve: [0.4, 1.9],
    });
    for (let pulse = 0; pulse < 4; pulse += 1) {
      Delay(0.05 + pulse * 0.45, () => {
        SpawnRing(center, { color: "#c7b48a", from: 0.1, to: 0.42, duration: 0.45, opacity: 0.3 });
      });
    }
    // 脚手架：四层木架逐层长出来，每层带一点回弹。整座工地只占合批里的一个 slot。
    while (activeScaffolds.length >= preset.scaffolds) {
      const oldest = activeScaffolds.shift();
      if (oldest && oldest.Finish) oldest.Finish();
    }
    const slot = AcquireScaffoldSlot();
    if (!slot) return;
    const layerScales = [0, 0, 0, 0];
    const record = { slot, Finish: null };
    activeScaffolds.push(record);
    WriteScaffoldSite(slot.index, slot.generation, center, layerScales, 0);
    const Retire = () => {
      ReleaseScaffoldSlot(slot.index, slot.generation);
      const index = activeScaffolds.indexOf(record);
      if (index >= 0) activeScaffolds.splice(index, 1);
    };
    const tween = AddTween(2.6, (t) => {
      for (let level = 0; level < layerScales.length; level += 1) {
        const local = Clamp((t * 2.6 - level * 0.42) / 0.4, 0, 1);
        layerScales[level] = local > 0 ? EaseOutBack(local) : 0;
      }
      const fadeValue = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1;
      WriteScaffoldSite(slot.index, slot.generation, center, layerScales, fadeValue);
    }, Retire);
    // 被后来的工地挤掉时立刻腾出 slot，否则新工地拿不到位置就没有脚手架可看
    record.Finish = () => {
      tween.elapsed = tween.duration;
      Retire();
    };
  }

  /**
   * 扫荡箭头：沿路径流动的红色 UV 动画带，带脉冲警示。
   * 每条箭头的几何都是独立的路径条带，无法与别的箭头合批，因此按并发条数封顶：
   * 超出上限时把最旧的一条立刻收走，保证它不会随战局无限堆积。
   */
  function SpawnSweepArrow(fromKey, toKey, arrowOptions = {}) {
    if (disposed) return null;
    while (sweepArrows.length >= sweepArrowLimit) RemoveSweepArrow(sweepArrows[0]);
    const { points } = PathOf(fromKey, toKey, arrowOptions.pathKeys);
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
    const segments = Math.max(12, points.length * 6);
    const width = arrowOptions.width ?? 0.34;
    const position = new Float32Array((segments + 1) * 2 * 3);
    const uv = new Float32Array((segments + 1) * 2 * 2);
    const indices = [];
    const sample = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      curve.getPoint(t, sample);
      curve.getTangent(Clamp(t, 0.001, 0.999), tangent);
      side.crossVectors(tangent, up).normalize().multiplyScalar(width / 2);
      const base = index * 6;
      position[base] = sample.x + side.x; position[base + 1] = sample.y + 0.05; position[base + 2] = sample.z + side.z;
      position[base + 3] = sample.x - side.x; position[base + 4] = sample.y + 0.05; position[base + 5] = sample.z - side.z;
      uv[index * 4] = t; uv[index * 4 + 1] = 1;
      uv[index * 4 + 2] = t; uv[index * 4 + 3] = 0;
      if (index < segments) {
        const v = index * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedTime,
        uRepeat: { value: Math.max(3, points.length * 1.4) },
        uSpeed: { value: arrowOptions.speed ?? 0.5 },
        uOpacity: { value: 0 },
        uColorCore: { value: new THREE.Color(arrowOptions.colorCore || "#d9825a") },
        uColorEdge: { value: new THREE.Color(arrowOptions.colorEdge || "#8e2820") },
      },
      vertexShader: sweepVertexShader,
      fragmentShader: sweepFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 7;
    root.add(mesh);
    const life = arrowOptions.life ?? 9;
    const entry = { mesh, geometry, material, removed: false };
    sweepArrows.push(entry);
    AddTween(life, (t) => {
      const fadeIn = SmoothStep(0, 0.06, t);
      const fadeOut = 1 - SmoothStep(0.85, 1, t);
      material.uniforms.uOpacity.value = fadeIn * fadeOut * (arrowOptions.opacity ?? 0.62);
    }, () => RemoveSweepArrow(entry));
    return entry;
  }

  /** 收走一条箭头。提前收走与寿命到期都会调到这里，因此必须可重入。 */
  function RemoveSweepArrow(entry) {
    if (!entry || entry.removed) return;
    entry.removed = true;
    const index = sweepArrows.indexOf(entry);
    if (index >= 0) sweepArrows.splice(index, 1);
    root.remove(entry.mesh);
    entry.geometry.dispose();
    entry.material.dispose();
  }

  function ClearSweepArrows() {
    while (sweepArrows.length) RemoveSweepArrow(sweepArrows[sweepArrows.length - 1]);
  }

  /** 情报侦察：同心环扩散 + 细光柱 + 微弱火花。 */
  function SpawnIntelPing(key) {
    if (disposed) return;
    const center = WorldOf(key, 0);
    for (let index = 0; index < 3; index += 1) {
      Delay(0.05 + index * 0.26, () => {
        SpawnRing(center, { color: "#8fb5b8", from: 0.1, to: 1.1, duration: 1, opacity: 0.42, holdUntil: 0.15 });
      });
    }
    CreateParticleBurst({
      position: center.clone(), shape: "SPARK", additive: true, count: 24, radius: 0.3, height: 0.05,
      speed: [0.06, 0.2], direction: "up", spread: 0.6, life: [0.8, 1.5], size: [4, 9], drag: 1.6, rise: 0.3,
      delay: [0, 0.5], colorA: "#cfe6e2", colorB: "#6f9aa0", opacity: 0.8, fade: 0.45, lit: 0, sizeCurve: [0.4, 1],
    });
    const beamGeometry = new THREE.CylinderGeometry(0.035, 0.09, 1.4, 10, 1, true);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: "#a8d0d0", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.copy(center).setY(center.y + 0.7);
    root.add(beam);
    AddTween(1.5, (t) => { beamMaterial.opacity = Math.sin(t * Math.PI) * 0.2; }, () => {
      root.remove(beam);
      beamGeometry.dispose();
      beamMaterial.dispose();
    });
  }

  // ------------------------------------------------------------------------
  // 飘字
  // ------------------------------------------------------------------------

  function GetTextTexture(text, color) {
    const cacheKey = `${text}|${color}`;
    if (textCache.has(cacheKey)) return textCache.get(cacheKey);
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 72;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.clearRect(0, 0, 256, 72);
    context.font = "bold 46px 'Noto Sans SC','Microsoft YaHei',sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 7;
    context.strokeStyle = "rgba(24,20,16,0.88)";
    context.strokeText(text, 128, 38);
    context.fillStyle = color;
    context.fillText(text, 128, 38);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (textCache.size > 40) {
      const oldestKey = textCache.keys().next().value;
      const oldest = textCache.get(oldestKey);
      if (oldest) oldest.dispose();
      textCache.delete(oldestKey);
    }
    textCache.set(cacheKey, texture);
    return texture;
  }

  /** 资源/事件飘字：始终面向相机，上浮淡出。 */
  function SpawnFloatingText(key, text, color = "#e6dcc4") {
    if (disposed) return null;
    const texture = GetTextTexture(String(text), color);
    if (!texture) return null;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
    const sprite = new THREE.Sprite(material);
    const center = WorldOf(key, 0.55);
    sprite.position.copy(center);
    sprite.scale.set(0.86, 0.24, 1);
    sprite.renderOrder = 20;
    root.add(sprite);
    AddTween(1.7, (t) => {
      sprite.position.y = center.y + EaseInOutCubic(t) * 0.5;
      material.opacity = SmoothStep(0, 0.12, t) * (1 - SmoothStep(0.62, 1, t));
    }, () => {
      root.remove(sprite);
      material.dispose();
    });
    return sprite;
  }

  // ------------------------------------------------------------------------
  // 烟柱
  // ------------------------------------------------------------------------

  /** 撤除一根烟柱：两块批里属于它的 slot 都真正归还（带 generation 校验，重复调用安全）。 */
  function ReleaseSmokeColumn(column) {
    if (!column) return;
    if (column.smokeSlot >= 0 && smokeBatches.smoke) ReleaseBatchSlot(smokeBatches.smoke, column.smokeSlot, column.smokeGeneration);
    if (column.emberSlot >= 0 && smokeBatches.ember) ReleaseBatchSlot(smokeBatches.ember, column.emberSlot, column.emberGeneration);
    column.smokeSlot = -1;
    column.emberSlot = -1;
  }

  /**
   * 持续烟柱（被焚村庄 / 被炸炮楼）。level 0 撤除，1-3 控制浓度、高度与余烬。
   * 烟柱是持久特效，写进常驻合批的 slot 里：无论战场上烧着几处，浓烟与余烬各自
   * 只有一个 draw call。浓度分级（粒子数 / 半径 / 寿命 / 尺寸 / 上升 / 扰动 / 不透
   * 明度）与「随时间变灰」的诞生时刻全部逐粒子随 aBatch 走，观感与独立发射器一致。
   */
  function SetSmoke(key, level) {
    if (disposed) return;
    const existing = smokeColumns.get(key);
    const clamped = Clamp(Math.round(level || 0), 0, 3);
    if (clamped <= 0) {
      if (existing) {
        ReleaseSmokeColumn(existing);
        smokeColumns.delete(key);
      }
      return;
    }
    if (existing && existing.level === clamped) return;
    if (existing) {
      ReleaseSmokeColumn(existing);
      smokeColumns.delete(key);
    }
    while (smokeColumns.size >= preset.smokeColumns) {
      const oldestKey = smokeColumns.keys().next().value;
      if (oldestKey === undefined) break;
      ReleaseSmokeColumn(smokeColumns.get(oldestKey));
      smokeColumns.delete(oldestKey);
    }
    const smokeBatch = GetSmokeBatch("smoke");
    const smokeSlot = AcquireBatchSlot(smokeBatch, key, preset.smokeColumns);
    if (smokeSlot < 0) return;
    const center = WorldOf(key, 0);
    WriteBatchSlot(smokeBatch, smokeSlot, {
      position: center, count: 26 + clamped * 22, radius: 0.1 + clamped * 0.04,
      height: 0.05, baseLift: 0.04, speed: [0.04, 0.14], direction: "up", spread: 0.4,
      life: [2.4 + clamped * 0.7, 3.6 + clamped * 0.9], size: [18 + clamped * 5, 34 + clamped * 12],
      delay: [0, 3.5],
    }, [clock, 0.2 + clamped * 0.1, 0.22 + clamped * 0.14, 0.1 + clamped * 0.05]);
    const column = {
      level: clamped, smokeSlot, smokeGeneration: smokeBatch.generation[smokeSlot],
      emberSlot: -1, emberGeneration: 0,
    };
    if (clamped >= 3) {
      const emberBatch = GetSmokeBatch("ember");
      const emberSlot = AcquireBatchSlot(emberBatch, key, preset.smokeColumns);
      if (emberSlot >= 0) {
        WriteBatchSlot(emberBatch, emberSlot, {
          position: center, count: 20, radius: 0.09, height: 0.04,
          speed: [0.08, 0.22], direction: "up", spread: 0.5, life: [1, 1.9], size: [4, 8],
          delay: [0, 1.8],
        }, [clock, 0.55, 0.4, 0.07]);
        column.emberSlot = emberSlot;
        column.emberGeneration = emberBatch.generation[emberSlot];
      }
    }
    smokeColumns.set(key, column);
  }

  function ClearSmoke() {
    for (const column of smokeColumns.values()) ReleaseSmokeColumn(column);
    smokeColumns.clear();
  }

  // ------------------------------------------------------------------------
  // 天气
  // ------------------------------------------------------------------------

  const weatherRecipes = {
    Snow: () => ({
      shape: "SOFT", count: 300, radius: 22, height: 14, baseLift: 3, speed: [0.05, 0.16], direction: "sphere",
      life: [11, 17], size: [5, 11], drag: 0.02, gravity: -0.012, rise: -0.32, swirl: 0.55, turbulence: 1.1,
      delay: [0, 14], colorA: "#e6e9ee", colorB: "#c2c8d0", opacity: 0.75, fade: 0.82, sizeCurve: [1, 1],
    }),
    Rain: () => ({
      shape: "STREAK", count: 320, radius: 20, height: 12, baseLift: 4, speed: [0.1, 0.25], direction: "sphere",
      life: [1.5, 2.4], size: [14, 24], drag: 0.02, gravity: -3.4, swirl: 0, turbulence: 0.1, tilt: 0.22,
      delay: [0, 2.4], colorA: "#9fb0bd", colorB: "#7d8d99", opacity: 0.4, fade: 0.72, sizeCurve: [1, 1],
    }),
    Dust: () => ({
      shape: "PUFF", count: 220, radius: 18, height: 1.1, baseLift: 0.05, speed: [0.35, 1.1], direction: "radial",
      spread: 0.12, life: [5, 8.5], size: [40, 96], drag: 0.22, rise: 0.05, swirl: 0.5, turbulence: 0.8,
      delay: [0, 7], colorA: "#b8a47c", colorB: "#8e8266", opacity: 0.2, fade: 0.5, sizeCurve: [0.5, 2.2],
    }),
    Fog: () => ({
      shape: "PUFF", count: 90, radius: 20, height: 1.6, baseLift: 0.2, speed: [0.05, 0.2], direction: "radial",
      spread: 0.05, life: [12, 20], size: [90, 180], drag: 0.05, rise: 0.01, swirl: 0.2, turbulence: 0.5,
      delay: [0, 16], colorA: "#c3c8c6", colorB: "#aeb4b3", opacity: 0.14, fade: 0.6, sizeCurve: [0.9, 1.5],
    }),
  };

  function BuildFogLayers() {
    const layers = [];
    const geometry = new THREE.PlaneGeometry(52, 52);
    geometry.rotateX(-Math.PI / 2);
    disposables.add(geometry);
    for (let index = 0; index < 3; index += 1) {
      const material = new THREE.ShaderMaterial({
        uniforms: { uTime: sharedTime, uOpacity: { value: 0 }, uDrift: { value: 0.006 + index * 0.004 }, uColor: { value: new THREE.Color("#c3c8c6") } },
        vertexShader: fogVertexShader,
        fragmentShader: fogFragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 0.35 + index * 0.42;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      root.add(mesh);
      disposables.add(material);
      layers.push({ mesh, material });
    }
    return layers;
  }

  /** 天气切换：新旧两套系统交叉淡入淡出，绝不硬切。 */
  function SetWeather(kind, intensity = 0.6) {
    if (disposed) return;
    const normalized = weatherRecipes[kind] ? kind : "Clear";
    const strength = Clamp(intensity, 0, 1);
    weather.kind = normalized;
    weather.intensity = strength;
    if (!preset.weather) {
      if (weather.active) FadeOutWeather(weather.active);
      weather.active = null;
      return;
    }
    if (weather.active && weather.active.kind === normalized) {
      weather.active.targetOpacity = strength;
      return;
    }
    if (weather.active) FadeOutWeather(weather.active);
    weather.active = null;
    if (normalized === "Clear") return;
    const recipe = weatherRecipes[normalized]();
    const baseOpacity = recipe.opacity;
    recipe.position = new THREE.Vector3();
    recipe.opacity = 0; // 从 0 淡入，SetWeather 永远不硬切
    const stream = CreateParticleStream(recipe);
    if (!stream) return;
    const entry = { kind: normalized, stream, opacity: 0, targetOpacity: strength, baseOpacity, fogLayers: null };
    if (normalized === "Fog") entry.fogLayers = BuildFogLayers();
    weather.active = entry;
  }

  function FadeOutWeather(entry) {
    entry.targetOpacity = 0;
    weather.fadingOut.push(entry);
  }

  function DestroyWeatherEntry(entry) {
    if (entry.stream) entry.stream.Release();
    if (entry.fogLayers) {
      for (const layer of entry.fogLayers) {
        root.remove(layer.mesh);
        layer.material.dispose();
        disposables.delete(layer.material);
      }
    }
  }

  function UpdateWeather(dt) {
    const entries = weather.active ? [weather.active, ...weather.fadingOut] : weather.fadingOut.slice();
    for (const entry of entries) {
      const rate = entry.targetOpacity > entry.opacity ? 1 / 1.4 : 1 / 1.1;
      entry.opacity += Clamp(entry.targetOpacity - entry.opacity, -dt * rate, dt * rate);
      const finalOpacity = entry.baseOpacity * entry.opacity * Lerp(0.55, 1, daylight);
      entry.stream.SetOpacity(finalOpacity);
      if (entry.fogLayers) {
        for (const layer of entry.fogLayers) layer.material.uniforms.uOpacity.value = entry.opacity * 0.26 * Lerp(0.6, 1, daylight);
      }
      // 天气域跟随相机，保证视野内总是有粒子（每帧只挪一个 Object3D）
      if (camera) {
        entry.stream.SetPosition(camera.position.x, 0, camera.position.z);
        if (entry.fogLayers) {
          for (const layer of entry.fogLayers) layer.mesh.position.set(camera.position.x, layer.mesh.position.y, camera.position.z);
        }
      }
    }
    for (let index = weather.fadingOut.length - 1; index >= 0; index -= 1) {
      if (weather.fadingOut[index].opacity <= 0.002) {
        DestroyWeatherEntry(weather.fadingOut[index]);
        weather.fadingOut.splice(index, 1);
      }
    }
  }

  // ------------------------------------------------------------------------
  // 时间、质量、主循环
  // ------------------------------------------------------------------------

  /** t: 0 = 午夜，0.25 = 日出，0.5 = 正午，0.75 = 日落。 */
  function SetTimeOfDay(t) {
    timeOfDay = ((t % 1) + 1) % 1;
    const noon = 1 - Math.abs(timeOfDay - 0.5) * 2;
    daylight = Clamp(Lerp(0.34, 1, SmoothStep(0.08, 0.62, noon)), 0.3, 1);
    sharedDaylight.value = daylight;
  }

  function SetQuality(level) {
    if (!qualityPresets[level] || level === quality) return;
    quality = level;
    preset = qualityPresets[level];
    // 超出新上限的发射器回收；正在播放的那些留到自然结束，不做突兀的截断
    for (const [key, pool] of emitterPools) {
      const limit = PoolLimit(key.endsWith(":1"));
      for (let index = pool.length - 1; index >= 0 && pool.length > limit; index -= 1) {
        if (pool[index].busy) continue;
        const removed = pool.splice(index, 1)[0];
        root.remove(removed.points);
        removed.geometry.dispose();
        removed.material.dispose();
        disposables.delete(removed.geometry);
        disposables.delete(removed.material);
      }
    }
    while (activeRings.length > preset.rings) {
      const oldest = activeRings.shift();
      if (oldest && oldest.Finish) oldest.Finish();
    }
    for (let index = lightPool.length - 1; index >= 0 && lightPool.length > preset.lights; index -= 1) {
      if (lightPool[index].busy) continue;
      root.remove(lightPool.splice(index, 1)[0].light);
    }
    // 持久合批的缓冲按最高档一次性开好，切档只收紧使用上限：多出来的 slot 就地归还
    while (smokeColumns.size > preset.smokeColumns) {
      const oldestKey = smokeColumns.keys().next().value;
      if (oldestKey === undefined) break;
      ReleaseSmokeColumn(smokeColumns.get(oldestKey));
      smokeColumns.delete(oldestKey);
    }
    while (activeScaffolds.length > preset.scaffolds) {
      const oldest = activeScaffolds.shift();
      if (oldest && oldest.Finish) oldest.Finish();
    }
    if (!preset.weather && weather.active) {
      FadeOutWeather(weather.active);
      weather.active = null;
    } else if (preset.weather && !weather.active && weather.kind !== "Clear") {
      SetWeather(weather.kind, weather.intensity);
    }
  }

  function Update(dt, elapsed) {
    if (disposed) return;
    const step = Clamp(Number.isFinite(dt) ? dt : 0.016, 0, 0.1);
    clock = Number.isFinite(elapsed) ? elapsed : clock + step;
    sharedTime.value = clock;
    TickModelWind(clock, options.windStrength ?? 1);
    for (let index = tweens.length - 1; index >= 0; index -= 1) {
      const tween = tweens[index];
      tween.elapsed += step;
      const t = Clamp(tween.elapsed / tween.duration, 0, 1);
      if (tween.OnUpdate) tween.OnUpdate(t, step);
      if (t >= 1) {
        tweens.splice(index, 1);
        if (tween.OnDone) tween.OnDone();
      }
    }
    for (const pool of emitterPools.values()) {
      for (const emitter of pool) {
        if (emitter.busy && !emitter.looping && clock >= emitter.releaseAt) ReleaseEmitter(emitter);
      }
    }
    UpdateWeather(step);
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    ClearSmoke();
    ClearSweepArrows();
    if (weather.active) DestroyWeatherEntry(weather.active);
    for (const entry of weather.fadingOut) DestroyWeatherEntry(entry);
    weather = { kind: "Clear", intensity: 0, active: null, fadingOut: [] };
    for (const tween of tweens) {
      if (tween.OnDone) tween.OnDone();
    }
    tweens.length = 0;
    for (const resolve of pendingResolvers) resolve();
    pendingResolvers.clear();
    for (const texture of textCache.values()) texture.dispose();
    textCache.clear();
    for (const item of disposables) {
      if (item && typeof item.dispose === "function") item.dispose();
    }
    disposables.clear();
    // 常驻合批：几何与材质都在 disposables 里已经释放，这里把场景引用与账面一并清干净
    for (const kind of Object.keys(smokeBatches)) {
      const batch = smokeBatches[kind];
      if (!batch) continue;
      root.remove(batch.points);
      smokeBatches[kind] = null;
    }
    for (const kind of Object.keys(ringBatches)) {
      const batch = ringBatches[kind];
      if (!batch) continue;
      batch.mesh.dispose();
      root.remove(batch.mesh);
      ringBatches[kind] = null;
    }
    if (scaffoldBatch) {
      scaffoldBatch.mesh.dispose();
      root.remove(scaffoldBatch.mesh);
      scaffoldBatch = null;
    }
    emitterPools.clear();
    lightPool.length = 0;
    activeMoves.length = 0;
    activeScaffolds.length = 0;
    activeRings.length = 0;
    root.traverse((child) => {
      if (child.geometry && typeof child.geometry.dispose === "function") child.geometry.dispose();
      if (child.material && typeof child.material.dispose === "function") child.material.dispose();
    });
    root.clear();
    if (root.parent) root.parent.remove(root);
  }

  SetTimeOfDay(options.timeOfDay ?? 0.5);

  return {
    root,
    get quality() { return quality; },
    Update,
    SpawnUnitMove,
    SpawnAmbush,
    SpawnSabotage,
    SpawnSweepArrow,
    SpawnMobilize,
    SpawnBuild,
    SpawnCapture,
    SpawnFloatingText,
    SpawnIntelPing,
    SpawnTunnelTravel,
    SetWeather,
    SetSmoke,
    ClearSmoke,
    ClearSweepArrows,
    SetTimeOfDay,
    SetQuality,
    SetHeightProvider(fn) { heightProvider = typeof fn === "function" ? fn : null; },
    CreateParticleBurst,
    CreateParticleStream,
    SpawnRing,
    Dispose,
  };
}
