// 《燎原 · 敌后1937》 —— three.js 3D 战场渲染器。
//
// 目标是现代 3A 策略游戏级别的观感，全部资产程序化生成（无任何外部贴图 / 模型）：
//   · 地块：平顶六边形棱柱（顶面多环细分 + 侧壁分层岩理），26×20=520 格合并成
//     单个 BufferGeometry，一次 draw call 画完；全场景稳定在 10 个 draw call 上下。
//   · 光照：方向光 + CSM 级联阴影 + 半球光 + 指数高度雾，太阳方位/高度/色温随
//     eraKey 与季节变化。
//   · 后处理：EffectComposer → RenderPass/SSAARenderPass → 自写 CinemaGrade
//     （阈值 Bloom + 解析式胶片 LUT + 暗角 + 颗粒）→ OutputPass。
//   · 迷雾：三态（未探索 / 已探索未见 / 可见）完全由一张 hexState DataTexture 驱动，
//     换回合只写纹理，绝不重建几何。
//   · 交互：hover 挤出描边、选中脉冲环、五种地毯高亮、地形起伏下精确拾取。
//
// 坐标契约来自 Script_Hex.mjs（平顶六边形，x = 1.5·size·q，z = √3·size·(r + q/2)，y 向上）。
// 模块顶层不执行任何 DOM / WebGL 副作用。

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.mjs";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.mjs";
import { RenderPass } from "three/addons/postprocessing/RenderPass.mjs";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.mjs";
import { OutputPass } from "three/addons/postprocessing/OutputPass.mjs";
import { SSAARenderPass } from "three/addons/postprocessing/SSAARenderPass.mjs";
import { CSM } from "three/addons/csm/CSM.mjs";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.mjs";

import {
  hexSize, hexDirections, HexKey, ParseHexKey, HexToWorld, WorldToHex, HexCornerOffsets,
  Clamp, Clamp01, Lerp, InverseLerp, FractalNoise2D, ValueNoise2D, HashString,
} from "./Script_Hex.mjs";

import {
  CreateTerrainMaterial, CreateNoiseTexture, CreateSkyDome, CreateWaterMaterial,
  CreateSeasonPalette, CreateBannerTexture, CreateFogOfWarMaterial, CreateOverlayMaterial,
  CreateStateFallbackTexture, DisposeMaterialCache, ResolveTerrainProfile, overlayKindColors,
} from "./Script_Materials.mjs";

// ---------------------------------------------------------------------------
// 0. 常量
// ---------------------------------------------------------------------------

/** 方向索引 i 对应的两个角点下标（与 Script_Hex 的 hexDirections 一一对应）。 */
const hexEdgeCorners = Object.freeze([[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]]);

/** 五种地毯高亮的顺序，编码进 highlightState 纹理的 R 通道。 */
const highlightKinds = Object.freeze(Object.keys(overlayKindColors));

const controlCodes = Object.freeze({ Enemy: 0, Contested: 1 / 3, Guerrilla: 2 / 3, Base: 1 });

const worldConfig = Object.freeze({
  tileRadius: 0.985,       // 略小于外接圆，留出细缝以凸显棋盘块
  elevationScale: 2.15,    // elevation 0..1 → 世界高度
  topRings: 3,             // 顶面环数（54 三角/格）
  strataBands: 3,          // 侧壁岩层带数
  wallSkirt: 0.20,         // 侧壁探入邻格顶面之下的深度
  edgeFloorDrop: 0.85,     // 地图边缘侧壁下沉深度
  waterLift: 0.030,
  overlayLift: 0.020,
  borderLift: 0.032,
  roadLift: 0.024,
  fogLowLift: 0.55,
  fogHighLift: 0.92,
});

/** 画质分级：真实切换阴影、后处理链、几何细节与像素比。 */
const qualityProfiles = Object.freeze({
  low: {
    pixelRatioCap: 1.0, shadows: false, csm: false, cascades: 0, shadowMapSize: 512,
    composer: false, bloom: false, bloomTaps: 8, ssaa: false, skyClouds: false,
    terrainDetail: 0.35, bumpStrength: 0.25, waterDetail: 0.0, fogClouds: false,
    anisotropy: 1, maxParticles: 220, csmMaxFar: 40,
  },
  medium: {
    pixelRatioCap: 1.25, shadows: true, csm: false, cascades: 1, shadowMapSize: 1024,
    composer: true, bloom: false, bloomTaps: 8, ssaa: false, skyClouds: true,
    terrainDetail: 0.7, bumpStrength: 0.4, waterDetail: 0.6, fogClouds: true,
    anisotropy: 4, maxParticles: 700, csmMaxFar: 55,
  },
  high: {
    pixelRatioCap: 1.6, shadows: true, csm: true, cascades: 2, shadowMapSize: 2048,
    composer: true, bloom: true, bloomTaps: 14, ssaa: false, skyClouds: true,
    terrainDetail: 1.0, bumpStrength: 0.55, waterDetail: 1.0, fogClouds: true,
    anisotropy: 8, maxParticles: 1600, csmMaxFar: 70,
  },
  ultra: {
    pixelRatioCap: 2.0, shadows: true, csm: true, cascades: 3, shadowMapSize: 2048,
    composer: true, bloom: true, bloomTaps: 22, ssaa: true, skyClouds: true,
    terrainDetail: 1.0, bumpStrength: 0.62, waterDetail: 1.0, fogClouds: true,
    anisotropy: 16, maxParticles: 3200, csmMaxFar: 90,
  },
});

/**
 * 存活渲染器计数。Script_Materials 的纹理缓存（噪声图、调色板、横幅）是跨实例共享的，
 * 只有最后一个渲染器销毁时才能拆掉，否则并存的第二个渲染器会拿到已释放的纹理。
 */
let liveRendererCount = 0;

/** 移动端 / 低性能设备自动降级。 */
function DetectDefaultQuality() {
  if (typeof window === "undefined") return "high";
  const width = window.innerWidth || 1280;
  const ratio = window.devicePixelRatio || 1;
  const touch = typeof navigator !== "undefined" && (navigator.maxTouchPoints || 0) > 1;
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 8;
  if (width < 560 || (touch && ratio >= 2.5 && width < 900) || cores <= 2) return "low";
  if (width < 820 || touch || cores <= 4) return "medium";
  return cores >= 12 && ratio <= 2 ? "ultra" : "high";
}

// ---------------------------------------------------------------------------
// 1. 后处理：自写色彩分级 / 阈值 Bloom / 暗角 / 胶片颗粒
// ---------------------------------------------------------------------------

/**
 * 工作在线性 HDR 空间（RenderPass 输出到 HalfFloat RT，three 在渲染到 RT 时
 * 不做 tone mapping，最终由 OutputPass 统一 ACES + sRGB）。
 */
const cinemaGradeShader = {
  name: "PrairieCinemaGrade",
  defines: { BLOOM_TAPS: 14 },
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.05 },
    uSaturation: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0.012, 0.012, 0.016) },
    uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uGammaValue: { value: new THREE.Vector3(1.0, 1.0, 1.02) },
    uShadowTint: { value: new THREE.Color(0x28313c) },
    uHighlightTint: { value: new THREE.Color(0xffe3b4) },
    uVignette: { value: 0.34 },
    uVignetteStart: { value: 0.42 },
    uGrain: { value: 0.034 },
    uBloomThreshold: { value: 0.8 },
    uBloomSoftness: { value: 0.45 },
    uBloomStrength: { value: 0.42 },
    uBloomRadius: { value: 22.0 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uGammaValue;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uVignette;
uniform float uVignetteStart;
uniform float uGrain;
uniform float uBloomThreshold;
uniform float uBloomSoftness;
uniform float uBloomStrength;
uniform float uBloomRadius;
varying vec2 vUv;

const vec3 lumaWeights = vec3( 0.2126, 0.7152, 0.0722 );

float Hash21( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}

#ifdef ENABLE_BLOOM
// 黄金角螺旋采样的阈值泛光：单 pass 完成，无需额外 render target。
vec3 GatherBloom( vec2 uv, vec2 texel ) {
  vec3 total = vec3( 0.0 );
  float weightTotal = 0.0;
  for ( int i = 0; i < BLOOM_TAPS; i ++ ) {
    float fi = float( i ) + 0.5;
    float angle = fi * 2.39996323;
    float radius = sqrt( fi / float( BLOOM_TAPS ) );
    vec2 offset = vec2( cos( angle ), sin( angle ) ) * radius * uBloomRadius * texel;
    vec3 sampled = texture2D( tDiffuse, uv + offset ).rgb;
    float luma = dot( sampled, lumaWeights );
    float mask = smoothstep( uBloomThreshold, uBloomThreshold + uBloomSoftness, luma );
    float weight = 1.0 - radius * 0.55;
    total += sampled * mask * weight;
    weightTotal += weight;
  }
  return total / max( weightTotal, 0.0001 );
}
#endif

void main() {
  vec2 texel = 1.0 / max( uResolution, vec2( 1.0 ) );
  vec3 color = texture2D( tDiffuse, vUv ).rgb;

  #ifdef ENABLE_BLOOM
    color += GatherBloom( vUv, texel ) * uBloomStrength;
  #endif

  color *= uExposure;

  // 解析式胶片 LUT：gain → lift → 逐通道 gamma（趾部/肩部略有差异，做出 40 年代
  // 纪实影像的冷阴影 / 暖高光，但不压细节）
  color = color * uGain + uLift;
  color = pow( max( color, vec3( 0.0 ) ), uGammaValue );

  float luma = dot( color, lumaWeights );
  float shadowWeight = 1.0 - smoothstep( 0.0, 0.40, luma );
  float highlightWeight = smoothstep( 0.30, 1.05, luma );
  vec3 shadowTintNormalized = uShadowTint / max( dot( uShadowTint, lumaWeights ), 0.001 );
  vec3 highlightTintNormalized = uHighlightTint / max( dot( uHighlightTint, lumaWeights ), 0.001 );
  color *= mix( vec3( 1.0 ), shadowTintNormalized, shadowWeight * 0.30 );
  color *= mix( vec3( 1.0 ), highlightTintNormalized, highlightWeight * 0.22 );

  color = mix( vec3( luma ), color, uSaturation );
  color = ( color - 0.18 ) * uContrast + 0.18;

  // 暗角（按画幅比例校正，避免宽屏两侧过黑）
  vec2 centered = ( vUv - 0.5 ) * vec2( max( uResolution.x / max( uResolution.y, 1.0 ), 0.001 ), 1.0 );
  float vignetteAmount = smoothstep( uVignetteStart, 1.05, length( centered ) * 1.35 );
  color *= 1.0 - uVignette * pow( vignetteAmount, 1.4 );

  // 胶片颗粒：暗部更明显，高光收敛，保持画面锐利
  float grain = Hash21( vUv * uResolution + vec2( fract( uTime * 13.0 ) * 311.0, fract( uTime * 7.0 ) * 197.0 ) ) - 0.5;
  color += grain * uGrain * mix( 1.0, 0.25, clamp( luma, 0.0, 1.0 ) );

  gl_FragColor = vec4( max( color, vec3( 0.0 ) ), 1.0 );
}`,
};

// ---------------------------------------------------------------------------
// 2. 几何工具
// ---------------------------------------------------------------------------

/** 生成单位外接圆的六边形多环细分布局（顶点 + 索引），复用于顶面 / 地毯 / 云雾。 */
function CreateHexRingLayout(rings) {
  const corners = HexCornerOffsets(1);
  const points = [{ x: 0, z: 0, t: 0 }];
  const ringStart = [0];
  for (let ring = 1; ring <= rings; ring += 1) {
    ringStart.push(points.length);
    const scale = ring / rings;
    for (let side = 0; side < 6; side += 1) {
      const from = corners[side];
      const to = corners[(side + 1) % 6];
      for (let step = 0; step < ring; step += 1) {
        const t = step / ring;
        points.push({ x: Lerp(from.x, to.x, t) * scale, z: Lerp(from.z, to.z, t) * scale, t: scale });
      }
    }
  }
  const indices = [];
  for (let ring = 1; ring <= rings; ring += 1) {
    const outerBase = ringStart[ring];
    const innerBase = ringStart[ring - 1];
    const outerCount = ring * 6;
    const innerCount = (ring - 1) * 6;
    let innerCursor = 0;
    let outerCursor = 0;
    for (let side = 0; side < 6; side += 1) {
      for (let step = 0; step < ring; step += 1) {
        const outerCurrent = outerBase + (outerCursor % outerCount);
        const outerNext = outerBase + ((outerCursor + 1) % outerCount);
        const innerCurrent = innerBase + (innerCount > 0 ? innerCursor % innerCount : 0);
        indices.push(innerCurrent, outerNext, outerCurrent);
        if (step < ring - 1) {
          if (innerCount > 0) {
            const innerNext = innerBase + ((innerCursor + 1) % innerCount);
            indices.push(innerCurrent, innerNext, outerNext);
          }
          innerCursor += 1;
        }
        outerCursor += 1;
      }
    }
  }
  return { points, indices, ringStart };
}

/** 把一堆同结构 BufferGeometry 合并成一个，并释放源几何体。 */
function MergeAndDispose(list) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  for (const geometry of list) geometry.dispose();
  return merged;
}

/** 世界坐标下的一段带状面片（道路 / 铁轨 / 边界线）。 */
function PushRibbon(target, fromX, fromY, fromZ, toX, toY, toZ, halfWidth, color, segments = 2) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz) || 1;
  const px = (-dz / length) * halfWidth;
  const pz = (dx / length) * halfWidth;
  const baseIndex = target.positions.length / 3;
  for (let step = 0; step <= segments; step += 1) {
    const t = step / segments;
    const cx = Lerp(fromX, toX, t);
    const cy = Lerp(fromY, toY, t);
    const cz = Lerp(fromZ, toZ, t);
    target.positions.push(cx - px, cy, cz - pz, cx + px, cy, cz + pz);
    target.normals.push(0, 1, 0, 0, 1, 0);
    target.uvs.push(0, t, 1, t);
    target.colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  for (let step = 0; step < segments; step += 1) {
    const a = baseIndex + step * 2;
    target.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
}

/** 从收集器数组生成 BufferGeometry。 */
function FinalizeGeometry(target, extras = {}) {
  if (!target.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(target.positions, 3));
  if (target.normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(target.normals, 3));
  if (target.uvs.length) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(target.uvs, 2));
  if (target.colors.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(target.colors, 3));
  if (target.hexUvs && target.hexUvs.length) geometry.setAttribute("aHexUv", new THREE.Float32BufferAttribute(target.hexUvs, 2));
  if (target.facets && target.facets.length) geometry.setAttribute("aFacet", new THREE.Float32BufferAttribute(target.facets, 3));
  if (target.puffs && target.puffs.length) geometry.setAttribute("aPuff", new THREE.Float32BufferAttribute(target.puffs, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(target.indices), 1));
  if (extras.computeNormals) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function CreateCollector() {
  return { positions: [], normals: [], uvs: [], colors: [], hexUvs: [], facets: [], puffs: [], indices: [] };
}

// ---------------------------------------------------------------------------
// 3. 主入口
// ---------------------------------------------------------------------------

/**
 * 创建渲染器句柄。
 * options: { quality, terrainDefinitions, seed, background, autoQuality, cameraDistance }
 */
export function CreateRenderer(canvas, options = {}) {
  if (!canvas) throw new Error("CreateRenderer 需要一个 canvas 元素");
  liveRendererCount += 1;

  // ---- 基础设施 ----------------------------------------------------------
  let quality = qualityProfiles[options.quality] ? options.quality : DetectDefaultQuality();
  let profile = qualityProfiles[quality];

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !profile.composer,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x9fb0bd, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xb9bfb2, 0.0125);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 1600);
  camera.position.set(0, 20, 24);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.screenSpacePanning = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.8;
  // 俯仰 25°–75°（以水平面为基准）→ OrbitControls 极角 15°–65°
  controls.minPolarAngle = THREE.MathUtils.degToRad(15);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(65);
  controls.minDistance = 6;
  controls.maxDistance = 96;
  // Civ 式操作：左键拖动平移（左键单击留给选格）、右键旋转、滚轮/双指缩放
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // ---- 材质与共享资源 ----------------------------------------------------
  const noiseTexture = CreateNoiseTexture(128, { seed: 19370707, octaves: 3, anisotropy: profile.anisotropy });
  const terrainMaterial = CreateTerrainMaterial(renderer, {
    noiseTexture,
    detailStrength: profile.terrainDetail,
    bumpStrength: profile.bumpStrength,
  });
  const waterMaterial = CreateWaterMaterial();
  const fogOfWarMaterial = CreateFogOfWarMaterial();
  const overlayMaterial = CreateOverlayMaterial("composite");
  const hoverMaterial = CreateOverlayMaterial("hover");
  const selectMaterial = CreateOverlayMaterial("select");
  const roadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0.0, name: "PrairieRoad" });
  const railMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35, name: "PrairieRail" });
  const borderMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false,
    side: THREE.DoubleSide, name: "PrairieBorder",
  });
  borderMaterial.polygonOffset = true;
  borderMaterial.polygonOffsetFactor = -3;
  borderMaterial.polygonOffsetUnits = -3;
  const localMaterials = [roadMaterial, railMaterial, borderMaterial];
  const standardMaterials = [terrainMaterial, roadMaterial, railMaterial];

  // ---- 场景骨架 ----------------------------------------------------------
  const skyDome = CreateSkyDome();
  scene.add(skyDome);

  const terrainGroup = new THREE.Group();
  terrainGroup.name = "PrairieTerrainGroup";
  const overlayGroup = new THREE.Group();
  overlayGroup.name = "PrairieOverlayGroup";
  const propGroup = new THREE.Group();
  propGroup.name = "PrairiePropGroup";
  scene.add(terrainGroup, overlayGroup, propGroup);

  const sunLight = new THREE.DirectionalLight(0xffd9a4, 2.5);
  sunLight.position.set(30, 40, 26);
  sunLight.target.position.set(0, 0, 0);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.camera.left = -26;
  sunLight.shadow.camera.right = 26;
  sunLight.shadow.camera.top = 26;
  sunLight.shadow.camera.bottom = -26;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight, sunLight.target);

  const hemisphereLight = new THREE.HemisphereLight(0xa9c0d4, 0x6a6152, 0.78);
  scene.add(hemisphereLight);
  const fillLight = new THREE.AmbientLight(0x54606c, 0.22);
  scene.add(fillLight);

  // ---- 运行期状态 --------------------------------------------------------
  let csm = null;
  let composer = null;
  let gradePass = null;
  let ssaaPass = null;
  let renderPass = null;
  let outputPass = null;

  let currentState = null;
  let terrainDefinitions = options.terrainDefinitions || null;
  let palette = CreateSeasonPalette("Opening", 0);
  let elapsedTime = 0;
  let disposed = false;

  const hexEntries = [];
  const hexByKey = new Map();
  let stateTextureWidth = 1;
  let stateTextureHeight = 1;
  let hexStateData = null;
  let hexStateTexture = null;
  let highlightData = null;
  let highlightTexture = null;
  const highlightByKind = new Map();

  let terrainMesh = null;
  let waterMesh = null;
  let roadMesh = null;
  let railMesh = null;
  let borderMesh = null;
  let overlayMesh = null;
  let fogCloudMesh = null;
  let hoverMesh = null;
  let selectMesh = null;

  let structureSignature = "";
  let borderSignature = "";
  let paletteSignature = "";

  let hoverKey = null;
  let selectedKey = null;

  const mapBounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20, centerX: 0, centerZ: 0, averageTopY: 0, minTopY: 0, maxTopY: 1 };

  const raycaster = new THREE.Raycaster();
  const pointerVector = new THREE.Vector2();
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pickPoint = new THREE.Vector3();
  const scratchVector = new THREE.Vector3();
  let pickCacheX = -99999;
  let pickCacheY = -99999;
  let pickCacheKey = null;

  let focusFlight = null;

  // 尝试异步载入 Data_Terrain.mjs（该文件由另一 agent 并行编写，可能尚未存在）。
  // 未到位时使用 Script_Materials 的内置回退表；到位后自动刷新顶点色。
  if (!terrainDefinitions) {
    Promise.resolve()
      .then(() => import("./Data_Terrain.mjs"))
      .then((module) => {
        if (disposed || !module || !module.terrainDefinitions) return;
        terrainDefinitions = module.terrainDefinitions;
        if (currentState) RefreshTerrainColors();
      })
      .catch(() => { /* 文件缺失属预期情况，静默沿用内置回退表 */ });
  }

  // -------------------------------------------------------------------------
  // 3.1 地图索引与状态纹理
  // -------------------------------------------------------------------------

  function BuildHexIndex(state) {
    hexEntries.length = 0;
    hexByKey.clear();
    const map = state && state.map ? state.map : null;
    if (!map || !map.hexes) return false;
    const order = Array.isArray(map.order) && map.order.length ? map.order : Object.keys(map.hexes);
    const seed = HashString(String(state.seed ?? map.width ?? 26));

    stateTextureWidth = Math.max(1, Math.ceil(Math.sqrt(order.length)));
    stateTextureHeight = Math.max(1, Math.ceil(order.length / stateTextureWidth));

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let sumTopY = 0, minTopY = Infinity, maxTopY = -Infinity;

    for (let index = 0; index < order.length; index += 1) {
      const key = order[index];
      const hex = map.hexes[key];
      if (!hex) continue;
      const axial = ParseHexKey(key);
      const world = HexToWorld(axial.q, axial.r, hexSize);
      const terrainProfile = ResolveTerrainProfile(hex.terrain, terrainDefinitions);
      const elevation = Clamp01(Number(hex.elevation) || 0);
      const topY = elevation * worldConfig.elevationScale;
      const column = index % stateTextureWidth;
      const row = Math.floor(index / stateTextureWidth);
      const entry = {
        key, hex, index,
        q: axial.q, r: axial.r,
        x: world.x, z: world.z,
        elevation,
        moisture: Clamp01(Number(hex.moisture) || 0),
        profile: terrainProfile,
        topY,
        stateU: (column + 0.5) / stateTextureWidth,
        stateV: (row + 0.5) / stateTextureHeight,
        phaseByte: Math.floor(ValueNoise2D(axial.q * 1.7, axial.r * 2.3, seed) * 255),
        seed: seed ^ HashString(key),
      };
      hexEntries.push(entry);
      hexByKey.set(key, entry);
      minX = Math.min(minX, world.x); maxX = Math.max(maxX, world.x);
      minZ = Math.min(minZ, world.z); maxZ = Math.max(maxZ, world.z);
      sumTopY += topY;
      minTopY = Math.min(minTopY, topY);
      maxTopY = Math.max(maxTopY, topY);
    }

    if (!hexEntries.length) return false;
    mapBounds.minX = minX - 1.5;
    mapBounds.maxX = maxX + 1.5;
    mapBounds.minZ = minZ - 1.5;
    mapBounds.maxZ = maxZ + 1.5;
    mapBounds.centerX = (minX + maxX) * 0.5;
    mapBounds.centerZ = (minZ + maxZ) * 0.5;
    mapBounds.averageTopY = sumTopY / hexEntries.length;
    mapBounds.minTopY = minTopY;
    mapBounds.maxTopY = maxTopY;
    return true;
  }

  function CreateStateTextures() {
    DisposeStateTextures();
    const texelCount = stateTextureWidth * stateTextureHeight;
    hexStateData = new Uint8Array(texelCount * 4);
    hexStateTexture = new THREE.DataTexture(hexStateData, stateTextureWidth, stateTextureHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
    hexStateTexture.magFilter = THREE.NearestFilter;
    hexStateTexture.minFilter = THREE.NearestFilter;
    hexStateTexture.generateMipmaps = false;
    hexStateTexture.needsUpdate = true;
    hexStateTexture.name = "PrairieHexState";

    highlightData = new Uint8Array(texelCount * 4);
    highlightTexture = new THREE.DataTexture(highlightData, stateTextureWidth, stateTextureHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
    highlightTexture.magFilter = THREE.NearestFilter;
    highlightTexture.minFilter = THREE.NearestFilter;
    highlightTexture.generateMipmaps = false;
    highlightTexture.needsUpdate = true;
    highlightTexture.name = "PrairieHighlightState";

    terrainMaterial.userData.uniforms.uHexState.value = hexStateTexture;
    waterMaterial.userData.uniforms.uHexState.value = hexStateTexture;
    fogOfWarMaterial.userData.uniforms.uHexState.value = hexStateTexture;
    overlayMaterial.userData.uniforms.uHighlightState.value = highlightTexture;
  }

  function DisposeStateTextures() {
    if (hexStateTexture) {
      hexStateTexture.dispose();
      hexStateTexture = null;
      const fallback = CreateStateFallbackTexture();
      terrainMaterial.userData.uniforms.uHexState.value = fallback;
      waterMaterial.userData.uniforms.uHexState.value = fallback;
      fogOfWarMaterial.userData.uniforms.uHexState.value = fallback;
    }
    if (highlightTexture) {
      highlightTexture.dispose();
      highlightTexture = null;
      overlayMaterial.userData.uniforms.uHighlightState.value = CreateStateFallbackTexture([0, 0, 0, 0]);
    }
    hexStateData = null;
    highlightData = null;
  }

  /** 把当前回合的探索/视野/归属/焦土写进 hexState 纹理。 */
  function WriteHexState() {
    if (!hexStateData) return;
    for (const entry of hexEntries) {
      const hex = entry.hex;
      const offset = entry.index * 4;
      const explored = hex.explored ? 255 : 0;
      const visibility = Clamp01((Number(hex.visibility) || 0) / 2);
      const controlCode = controlCodes[hex.control] ?? 0;
      const scorch = Clamp01((Number(hex.scorch) || 0) / 100);
      hexStateData[offset] = explored;
      hexStateData[offset + 1] = Math.round(visibility * 255);
      hexStateData[offset + 2] = Math.round(controlCode * 255);
      hexStateData[offset + 3] = Math.round(scorch * 255);
    }
    hexStateTexture.needsUpdate = true;
  }

  function RewriteHighlightTexture() {
    if (!highlightData) return;
    highlightData.fill(0);
    for (const [kindName, keySet] of highlightByKind) {
      const code = highlightKinds.indexOf(kindName) + 1;
      if (code <= 0) continue;
      const encoded = Math.round((code / highlightKinds.length) * 255);
      for (const key of keySet) {
        const entry = hexByKey.get(key);
        if (!entry) continue;
        const offset = entry.index * 4;
        highlightData[offset] = encoded;
        highlightData[offset + 1] = 255;
        highlightData[offset + 2] = entry.phaseByte;
        highlightData[offset + 3] = 255;
      }
    }
    highlightTexture.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // 3.2 地形几何
  // -------------------------------------------------------------------------

  const topLayout = CreateHexRingLayout(worldConfig.topRings);
  const carpetLayout = CreateHexRingLayout(2);
  const scratchColor = new THREE.Color();
  const colorLowCache = new Map();
  const colorHighCache = new Map();
  const strataLowCache = new Map();
  const strataHighCache = new Map();

  function CachedColor(cache, value) {
    let color = cache.get(value);
    if (!color) { color = new THREE.Color(value); cache.set(value, color); }
    return color;
  }

  // 常驻的噪声参数对象：顶点级采样每帧成千上万次，避免逐次分配临时对象
  const reliefNoiseOptions = { octaves: 3, seed: 4177, persistence: 0.5 };
  const fineNoiseOptions = { octaves: 2, seed: 9311 };
  const blotchNoiseOptions = { octaves: 3, seed: 2711 };

  /** 顶面某点的高度：地块高台 + 地形起伏 + 山峰隆起，边缘收敛保持棱块轮廓。 */
  function SampleTopHeight(entry, localX, localZ, radialT) {
    const worldX = entry.x + localX;
    const worldZ = entry.z + localZ;
    const relief = FractalNoise2D(worldX * 0.62, worldZ * 0.62, reliefNoiseOptions) - 0.5;
    const fine = FractalNoise2D(worldX * 2.4, worldZ * 2.4, fineNoiseOptions) - 0.5;
    const edgeFalloff = 1 - 0.62 * Math.pow(radialT, 2.2);
    const peak = entry.profile.peak * Math.pow(1 - radialT, 1.7);
    return entry.topY + (relief * 2 * entry.profile.relief + fine * 0.5 * entry.profile.relief) * edgeFalloff + peak;
  }

  /** 顶面顶点色：地形色带 × 高程 × 湿度 × 噪声打断。 */
  function SampleTopColor(entry, localX, localZ, radialT, out) {
    const band = entry.profile.elevationBand;
    const bandT = Clamp01(InverseLerp(band[0], band[1], entry.elevation));
    const worldX = entry.x + localX;
    const worldZ = entry.z + localZ;
    const blotch = FractalNoise2D(worldX * 0.9, worldZ * 0.9, blotchNoiseOptions);
    const mix = Clamp01(bandT * 0.72 + (blotch - 0.5) * 0.55 + (1 - radialT) * 0.08);
    const low = CachedColor(colorLowCache, entry.profile.colorLow);
    const high = CachedColor(colorHighCache, entry.profile.colorHigh);
    out.copy(low).lerp(high, mix);
    // 湿度 → 向季节植被色靠拢；河谷压暗
    scratchColor.setHex(palette.grass);
    out.lerp(scratchColor, Clamp01(entry.moisture * entry.profile.wet) * 0.44);
    const shade = 0.86 + 0.30 * blotch - 0.10 * radialT;
    out.multiplyScalar(shade);
    return out;
  }

  function BuildTerrainGeometry() {
    const collector = CreateCollector();
    const corners = HexCornerOffsets(worldConfig.tileRadius);
    const bands = worldConfig.strataBands;
    const rings = worldConfig.topRings;
    const rimHeights = new Array(6);
    const workColor = new THREE.Color();
    const globalFloor = mapBounds.minTopY - worldConfig.edgeFloorDrop;

    for (const entry of hexEntries) {
      // --- 顶面 ---
      const topBase = collector.positions.length / 3;
      for (const point of topLayout.points) {
        const localX = point.x * worldConfig.tileRadius;
        const localZ = point.z * worldConfig.tileRadius;
        const height = SampleTopHeight(entry, localX, localZ, point.t);
        collector.positions.push(entry.x + localX, height, entry.z + localZ);
        collector.normals.push(0, 1, 0);
        collector.uvs.push(point.x * 0.5 + 0.5, point.z * 0.5 + 0.5);
        SampleTopColor(entry, localX, localZ, point.t, workColor);
        collector.colors.push(workColor.r, workColor.g, workColor.b);
        collector.hexUvs.push(entry.stateU, entry.stateV);
        collector.facets.push(1, entry.elevation, Clamp01(entry.moisture * entry.profile.wet));
      }
      for (let index = 0; index < topLayout.indices.length; index += 1) {
        collector.indices.push(topBase + topLayout.indices[index]);
      }

      // 记录 6 个角点的实际高度，供侧壁精确贴合
      const outerBase = topLayout.ringStart[rings];
      for (let corner = 0; corner < 6; corner += 1) {
        const pointIndex = outerBase + corner * rings;
        rimHeights[corner] = collector.positions[(topBase + pointIndex) * 3 + 1];
      }

      // --- 侧壁 ---
      const strataLow = CachedColor(strataLowCache, entry.profile.strataLow);
      const strataHigh = CachedColor(strataHighCache, entry.profile.strataHigh);
      for (let side = 0; side < 6; side += 1) {
        const [cornerA, cornerB] = hexEdgeCorners[side];
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        const rimTop = Math.min(rimHeights[cornerA], rimHeights[cornerB]);
        let bottom;
        if (neighbour) {
          bottom = Math.min(rimTop, neighbour.topY) - worldConfig.wallSkirt;
        } else {
          bottom = globalFloor;
        }
        bottom = Math.min(bottom, rimTop - 0.06);
        const pointA = corners[cornerA];
        const pointB = corners[cornerB];
        const wallBase = collector.positions.length / 3;
        for (let bandIndex = 0; bandIndex <= bands; bandIndex += 1) {
          const depthT = bandIndex / bands;
          const heightA = Lerp(rimHeights[cornerA], bottom, depthT);
          const heightB = Lerp(rimHeights[cornerB], bottom, depthT);
          workColor.copy(strataHigh).lerp(strataLow, depthT);
          const jitter = 0.9 + 0.2 * ValueNoise2D(entry.q * 3.1 + side, entry.r * 2.7 + bandIndex, entry.seed);
          workColor.multiplyScalar(jitter);
          collector.positions.push(entry.x + pointA.x, heightA, entry.z + pointA.z);
          collector.positions.push(entry.x + pointB.x, heightB, entry.z + pointB.z);
          collector.normals.push(0, 0, 1, 0, 0, 1);
          collector.uvs.push(0, depthT, 1, depthT);
          collector.colors.push(workColor.r, workColor.g, workColor.b, workColor.r, workColor.g, workColor.b);
          collector.hexUvs.push(entry.stateU, entry.stateV, entry.stateU, entry.stateV);
          collector.facets.push(0, entry.elevation, depthT, 0, entry.elevation, depthT);
        }
        for (let bandIndex = 0; bandIndex < bands; bandIndex += 1) {
          const topA = wallBase + bandIndex * 2;
          const topB = topA + 1;
          const bottomA = topA + 2;
          const bottomB = topA + 3;
          collector.indices.push(topA, bottomB, bottomA, topA, topB, bottomB);
        }
      }
    }

    return FinalizeGeometry(collector, { computeNormals: true });
  }

  /** Data_Terrain 迟到时，只重写顶点色属性，不动几何结构。 */
  function RefreshTerrainColors() {
    if (!terrainMesh || !terrainMesh.geometry) return;
    for (const entry of hexEntries) entry.profile = ResolveTerrainProfile(entry.hex.terrain, terrainDefinitions);
    const colorAttribute = terrainMesh.geometry.getAttribute("color");
    if (!colorAttribute) return;
    const bands = worldConfig.strataBands;
    const topVertexCount = topLayout.points.length;
    const wallVertexCount = 6 * (bands + 1) * 2;
    const perHex = topVertexCount + wallVertexCount;
    const workColor = new THREE.Color();
    for (let hexIndex = 0; hexIndex < hexEntries.length; hexIndex += 1) {
      const entry = hexEntries[hexIndex];
      const base = hexIndex * perHex;
      for (let pointIndex = 0; pointIndex < topVertexCount; pointIndex += 1) {
        const point = topLayout.points[pointIndex];
        SampleTopColor(entry, point.x * worldConfig.tileRadius, point.z * worldConfig.tileRadius, point.t, workColor);
        colorAttribute.setXYZ(base + pointIndex, workColor.r, workColor.g, workColor.b);
      }
      const strataLow = CachedColor(strataLowCache, entry.profile.strataLow);
      const strataHigh = CachedColor(strataHighCache, entry.profile.strataHigh);
      let cursor = base + topVertexCount;
      for (let side = 0; side < 6; side += 1) {
        for (let bandIndex = 0; bandIndex <= bands; bandIndex += 1) {
          const depthT = bandIndex / bands;
          workColor.copy(strataHigh).lerp(strataLow, depthT);
          const jitter = 0.9 + 0.2 * ValueNoise2D(entry.q * 3.1 + side, entry.r * 2.7 + bandIndex, entry.seed);
          workColor.multiplyScalar(jitter);
          colorAttribute.setXYZ(cursor, workColor.r, workColor.g, workColor.b);
          colorAttribute.setXYZ(cursor + 1, workColor.r, workColor.g, workColor.b);
          cursor += 2;
        }
      }
    }
    colorAttribute.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // 3.3 附属层：水面 / 云雾 / 地毯 / 道路 / 铁路 / 边界
  // -------------------------------------------------------------------------

  function BuildWaterGeometry() {
    const pieces = [];
    for (const entry of hexEntries) {
      if (!entry.profile.water) continue;
      const geometry = BuildHexDisc(carpetLayout, worldConfig.tileRadius * 0.99, entry, entry.topY + worldConfig.waterLift, false);
      pieces.push(geometry);
    }
    return MergeAndDispose(pieces);
  }

  /** 单块六边形圆盘（供水面 / 地毯 / 云雾复用），uv 归一化到 ±1。 */
  function BuildHexDisc(layout, radius, entry, height, withPuff, puffAmplitude = 0, puffBias = 0) {
    const geometry = new THREE.BufferGeometry();
    const count = layout.points.length;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const hexUvs = new Float32Array(count * 2);
    const puffs = withPuff ? new Float32Array(count * 3) : null;
    for (let index = 0; index < count; index += 1) {
      const point = layout.points[index];
      positions[index * 3] = entry.x + point.x * radius;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = entry.z + point.z * radius;
      normals[index * 3 + 1] = 1;
      uvs[index * 2] = point.x * 0.5 + 0.5;
      uvs[index * 2 + 1] = point.z * 0.5 + 0.5;
      hexUvs[index * 2] = entry.stateU;
      hexUvs[index * 2 + 1] = entry.stateV;
      if (puffs) {
        puffs[index * 3] = (entry.phaseByte / 255);
        puffs[index * 3 + 1] = puffAmplitude;
        puffs[index * 3 + 2] = puffBias;
      }
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("aHexUv", new THREE.BufferAttribute(hexUvs, 2));
    if (puffs) geometry.setAttribute("aPuff", new THREE.BufferAttribute(puffs, 3));
    geometry.setIndex(layout.indices.slice());
    return geometry;
  }

  function BuildOverlayGeometry() {
    const pieces = [];
    for (const entry of hexEntries) {
      pieces.push(BuildHexDisc(carpetLayout, worldConfig.tileRadius, entry, entry.topY + worldConfig.overlayLift, false));
    }
    return MergeAndDispose(pieces);
  }

  function BuildFogCloudGeometry() {
    const pieces = [];
    for (const entry of hexEntries) {
      const highOffset = 0.14 * (entry.phaseByte / 255);
      pieces.push(BuildHexDisc(carpetLayout, worldConfig.tileRadius * 1.06, entry,
        entry.topY + worldConfig.fogLowLift + highOffset, true, 1.0, 0.0));
      pieces.push(BuildHexDisc(carpetLayout, worldConfig.tileRadius * 0.82, entry,
        entry.topY + worldConfig.fogHighLift + highOffset * 1.6, true, 0.55, 0.22));
    }
    return MergeAndDispose(pieces);
  }

  function EdgeMidHeight(entry, neighbour) {
    return (entry.topY + neighbour.topY) * 0.5;
  }

  function BuildRoadGeometry() {
    const collector = CreateCollector();
    const dirtColor = new THREE.Color(0x8b7c5c);
    const pavedColor = new THREE.Color(0x585553);
    for (const entry of hexEntries) {
      const level = Number(entry.hex.road) || 0;
      if (level <= 0) continue;
      const color = level >= 2 ? pavedColor : dirtColor;
      const halfWidth = level >= 2 ? 0.16 : 0.11;
      const centerY = entry.topY + worldConfig.roadLift;
      let linked = 0;
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        if (!neighbour || (Number(neighbour.hex.road) || 0) <= 0) continue;
        const midX = (entry.x + neighbour.x) * 0.5;
        const midZ = (entry.z + neighbour.z) * 0.5;
        const midY = EdgeMidHeight(entry, neighbour) + worldConfig.roadLift;
        PushRibbon(collector, entry.x, centerY, entry.z, midX, midY, midZ, halfWidth, color, 3);
        linked += 1;
      }
      // 孤立路段也画一小段，避免村口断头
      if (linked === 0) {
        PushRibbon(collector, entry.x - 0.4, centerY, entry.z, entry.x + 0.4, centerY, entry.z, halfWidth, color, 2);
      }
    }
    return FinalizeGeometry(collector);
  }

  function BuildRailGeometry() {
    const collector = CreateCollector();
    const bedColor = new THREE.Color(0x4a423a);
    const railColor = new THREE.Color(0x9aa0a4);
    const brokenColor = new THREE.Color(0x6d2f22);
    const sleeperPieces = [];
    const sleeperGeometry = new THREE.BoxGeometry(0.30, 0.045, 0.075);
    const sleeperMatrix = new THREE.Matrix4();
    const sleeperQuaternion = new THREE.Quaternion();
    const sleeperScale = new THREE.Vector3(1, 1, 1);
    const sleeperPosition = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);

    for (const entry of hexEntries) {
      if (!entry.hex.railway) continue;
      const broken = (Number(entry.hex.railBroken) || 0) > 0;
      const bed = broken ? brokenColor : bedColor;
      const rail = broken ? brokenColor : railColor;
      const centerY = entry.topY + worldConfig.roadLift + 0.012;
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        if (!neighbour || !neighbour.hex.railway) continue;
        const midX = (entry.x + neighbour.x) * 0.5;
        const midZ = (entry.z + neighbour.z) * 0.5;
        const midY = EdgeMidHeight(entry, neighbour) + worldConfig.roadLift + 0.012;
        PushRibbon(collector, entry.x, centerY, entry.z, midX, midY, midZ, 0.17, bed, 3);
        // 两条钢轨
        const dx = midX - entry.x;
        const dz = midZ - entry.z;
        const length = Math.hypot(dx, dz) || 1;
        const offsetX = (-dz / length) * 0.075;
        const offsetZ = (dx / length) * 0.075;
        PushRibbon(collector, entry.x + offsetX, centerY + 0.02, entry.z + offsetZ,
          midX + offsetX, midY + 0.02, midZ + offsetZ, 0.018, rail, 2);
        PushRibbon(collector, entry.x - offsetX, centerY + 0.02, entry.z - offsetZ,
          midX - offsetX, midY + 0.02, midZ - offsetZ, 0.018, rail, 2);
        // 枕木
        const angle = Math.atan2(dx, dz);
        sleeperQuaternion.setFromAxisAngle(upAxis, angle);
        const sleeperCount = broken ? 2 : 4;
        for (let step = 0; step < sleeperCount; step += 1) {
          const t = (step + 0.5) / sleeperCount;
          sleeperPosition.set(Lerp(entry.x, midX, t), Lerp(centerY, midY, t) + 0.006, Lerp(entry.z, midZ, t));
          sleeperMatrix.compose(sleeperPosition, sleeperQuaternion, sleeperScale);
          const piece = sleeperGeometry.clone();
          piece.applyMatrix4(sleeperMatrix);
          const vertexCount = piece.getAttribute("position").count;
          const colorArray = new Float32Array(vertexCount * 3);
          for (let vertex = 0; vertex < vertexCount; vertex += 1) {
            colorArray[vertex * 3] = bed.r * 0.85;
            colorArray[vertex * 3 + 1] = bed.g * 0.85;
            colorArray[vertex * 3 + 2] = bed.b * 0.85;
          }
          piece.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));
          piece.deleteAttribute("uv");
          sleeperPieces.push(piece);
        }
      }
    }
    sleeperGeometry.dispose();

    const ribbonGeometry = FinalizeGeometry(collector);
    if (ribbonGeometry) ribbonGeometry.deleteAttribute("uv");
    const sleeperMerged = MergeAndDispose(sleeperPieces);
    if (ribbonGeometry && sleeperMerged) {
      const merged = mergeGeometries([ribbonGeometry, sleeperMerged], false);
      ribbonGeometry.dispose();
      sleeperMerged.dispose();
      return merged;
    }
    return ribbonGeometry || sleeperMerged;
  }

  function BuildBorderGeometry() {
    const collector = CreateCollector();
    const corners = HexCornerOffsets(worldConfig.tileRadius * 0.96);
    const colorByControl = new Map();
    for (const [name, value] of Object.entries(palette.control)) colorByControl.set(name, new THREE.Color(value));
    const fallbackColor = new THREE.Color(0x9a9080);

    for (const entry of hexEntries) {
      const control = entry.hex.control;
      if (!control || control === "Enemy") continue;
      const color = colorByControl.get(control) || fallbackColor;
      for (let side = 0; side < 6; side += 1) {
        const direction = hexDirections[side];
        const neighbour = hexByKey.get(HexKey(entry.q + direction.q, entry.r + direction.r));
        if (neighbour && neighbour.hex.control === control) continue;
        const [cornerA, cornerB] = hexEdgeCorners[side];
        const ax = entry.x + corners[cornerA].x;
        const az = entry.z + corners[cornerA].z;
        const bx = entry.x + corners[cornerB].x;
        const bz = entry.z + corners[cornerB].z;
        const height = entry.topY + worldConfig.borderLift;
        PushRibbon(collector, ax, height, az, bx, height, bz, 0.055, color, 1);
      }
    }
    return FinalizeGeometry(collector);
  }

  /** 悬停描边：从地块边沿向下挤出的六边形"外框"。 */
  function BuildHoverOutlineGeometry() {
    const collector = CreateCollector();
    const outer = HexCornerOffsets(1.005);
    const inner = HexCornerOffsets(0.86);
    const depth = 0.34;
    // 顶部环带
    for (let side = 0; side < 6; side += 1) {
      const a = outer[side];
      const b = outer[(side + 1) % 6];
      const ia = inner[side];
      const ib = inner[(side + 1) % 6];
      const base = collector.positions.length / 3;
      const u0 = side / 6;
      const u1 = (side + 1) / 6;
      collector.positions.push(a.x, 0, a.z, b.x, 0, b.z, ib.x, 0, ib.z, ia.x, 0, ia.z);
      collector.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      collector.uvs.push(u0, 0, u1, 0, u1, 0.28, u0, 0.28);
      collector.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // 外侧裙边
    for (let side = 0; side < 6; side += 1) {
      const a = outer[side];
      const b = outer[(side + 1) % 6];
      const base = collector.positions.length / 3;
      const u0 = side / 6;
      const u1 = (side + 1) / 6;
      collector.positions.push(a.x, 0, a.z, b.x, 0, b.z, b.x, -depth, b.z, a.x, -depth, a.z);
      collector.normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
      collector.uvs.push(u0, 0.28, u1, 0.28, u1, 1, u0, 1);
      collector.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const geometry = FinalizeGeometry(collector);
    if (geometry) geometry.setAttribute("aHexUv", new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 2), 2));
    return geometry;
  }

  /** 选中脉冲环：半径 1.4 的圆盘，uv 以外接圆 1.0 为基准，便于着色器画六边形描边。 */
  function BuildSelectRingGeometry() {
    const segments = 72;
    const radius = 1.42;
    const positions = [0, 0, 0];
    const normals = [0, 1, 0];
    const uvs = [0.5, 0.5];
    const indices = [];
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
    }
    for (let index = 1; index <= segments; index += 1) indices.push(0, index + 1, index);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("aHexUv", new THREE.Float32BufferAttribute(new Float32Array((segments + 2) * 2), 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  // -------------------------------------------------------------------------
  // 3.4 光照 / 后处理 / 画质
  // -------------------------------------------------------------------------

  const sunDirection = new THREE.Vector3(0.4, 0.6, 0.7);

  function ComputeSunDirection() {
    const elevation = THREE.MathUtils.degToRad(palette.sun.elevation);
    const azimuth = THREE.MathUtils.degToRad(palette.sun.azimuth);
    sunDirection.set(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.max(Math.sin(elevation), 0.12),
      Math.cos(elevation) * Math.cos(azimuth)
    ).normalize();
    return sunDirection;
  }

  function AttachCsmToMaterial(material) {
    const base = material.userData.baseOnBeforeCompile || null;
    csm.setupMaterial(material);
    const csmCompile = material.onBeforeCompile;
    material.onBeforeCompile = function ChainedOnBeforeCompile(shader, rendererReference) {
      csmCompile.call(this, shader, rendererReference);
      if (base) base.call(this, shader, rendererReference);
    };
    material.needsUpdate = true;
  }

  function DetachCsmFromMaterial(material) {
    if (material.defines) {
      delete material.defines.USE_CSM;
      delete material.defines.CSM_CASCADES;
      delete material.defines.CSM_FADE;
    }
    // 有自定义注入的材质恢复自己的注入函数；没有的直接删掉自有属性，退回原型上的空实现
    if (material.userData.baseOnBeforeCompile) material.onBeforeCompile = material.userData.baseOnBeforeCompile;
    else delete material.onBeforeCompile;
    material.needsUpdate = true;
  }

  /**
   * CSM.dispose() 只解绑 shader，既不把级联方向光移出场景，也不释放阴影贴图。
   * 切画质时若不手动清理，级联灯会逐次累积（2 → 4 → 7 …），阴影显存也会泄漏。
   */
  function DisposeCsm() {
    if (!csm) return;
    const cascadeLights = Array.isArray(csm.lights) ? csm.lights.slice() : [];
    try { csm.remove(); } catch (error) { /* 已被移除时忽略 */ }
    try { csm.dispose(); } catch (error) { /* CSM 内部清理失败不应阻断渲染 */ }
    for (const light of cascadeLights) {
      if (light.shadow && light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      if (light.parent) light.parent.remove(light);
      if (light.target && light.target.parent) light.target.parent.remove(light.target);
      light.dispose();
    }
    csm = null;
    for (const material of standardMaterials) DetachCsmFromMaterial(material);
  }

  function RebuildLighting() {
    DisposeCsm();
    const direction = ComputeSunDirection();
    sunLight.color.setHex(palette.sun.color);
    sunLight.intensity = palette.sun.intensity;
    hemisphereLight.color.setHex(palette.ambient.sky);
    hemisphereLight.groundColor.setHex(palette.ambient.ground);
    hemisphereLight.intensity = palette.ambient.intensity;
    fillLight.intensity = 0.16 + (1 - Clamp01(palette.sun.intensity / 3)) * 0.22;

    renderer.shadowMap.enabled = profile.shadows;

    if (profile.csm && profile.shadows) {
      try {
        csm = new CSM({
          camera,
          parent: scene,
          cascades: profile.cascades,
          maxFar: profile.csmMaxFar,
          mode: "practical",
          shadowMapSize: profile.shadowMapSize,
          shadowBias: -0.00045,
          lightDirection: direction.clone().negate(),
          lightIntensity: palette.sun.intensity / profile.cascades,
          lightMargin: 60,
        });
        csm.fade = true;
        for (const light of csm.lights) light.color.setHex(palette.sun.color);
        sunLight.visible = false;
        sunLight.castShadow = false;
        for (const material of standardMaterials) AttachCsmToMaterial(material);
        return;
      } catch (error) {
        csm = null;
      }
    }

    sunLight.visible = true;
    sunLight.castShadow = profile.shadows;
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
    sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    for (const material of standardMaterials) material.needsUpdate = true;
  }

  function DisposeComposer() {
    if (!composer) return;
    composer.dispose();
    if (gradePass) { gradePass.dispose(); gradePass = null; }
    if (ssaaPass) { ssaaPass.dispose(); ssaaPass = null; }
    if (renderPass) { renderPass.dispose(); renderPass = null; }
    if (outputPass) { outputPass.dispose(); outputPass = null; }
    composer = null;
  }

  function RebuildComposer() {
    DisposeComposer();
    if (!profile.composer) {
      handle.composer = null;
      return;
    }
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());

    if (profile.ssaa) {
      ssaaPass = new SSAARenderPass(scene, camera);
      ssaaPass.sampleLevel = 1;
      ssaaPass.unbiased = false;
      composer.addPass(ssaaPass);
    } else {
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
    }

    gradePass = new ShaderPass(cinemaGradeShader);
    gradePass.material.defines = Object.assign({}, gradePass.material.defines, { BLOOM_TAPS: profile.bloomTaps });
    if (profile.bloom) gradePass.material.defines.ENABLE_BLOOM = "";
    gradePass.material.needsUpdate = true;
    composer.addPass(gradePass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);

    handle.composer = composer;
    ApplyGradeFromPalette();
    Resize();
  }

  function ApplyGradeFromPalette() {
    if (!gradePass) return;
    const grade = palette.grade;
    const uniforms = gradePass.uniforms;
    uniforms.uSaturation.value = grade.saturation;
    uniforms.uContrast.value = grade.contrast;
    uniforms.uVignette.value = grade.vignette;
    uniforms.uGrain.value = grade.grain;
    uniforms.uBloomThreshold.value = grade.bloomThreshold;
    uniforms.uBloomStrength.value = profile.bloom ? grade.bloomStrength : 0;
    uniforms.uLift.value.set(grade.lift * 0.9, grade.lift, grade.lift * 1.25);
    uniforms.uShadowTint.value.setHex(grade.shadowTint);
    uniforms.uHighlightTint.value.setHex(grade.highlightTint);
    // 逐通道 gamma 构成"解析式 LUT"：蓝通道略提，红通道略压，做出旧胶片的偏色
    uniforms.uGammaValue.value.set(1.0 + (grade.contrast - 1) * 0.35, 1.0, 1.03);
    uniforms.uGain.value.set(1.0, 0.995, 0.985);
  }

  function ApplyPaletteToScene() {
    terrainMaterial.userData.ApplyPalette(palette);
    waterMaterial.userData.ApplyPalette(palette);
    fogOfWarMaterial.userData.ApplyPalette(palette);
    skyDome.userData.ApplyPalette(palette);
    if (!profile.skyClouds) skyDome.userData.uniforms.uCloudOpacity.value = 0;
    scene.fog.color.setHex(palette.fog.color);
    scene.fog.density = palette.fog.density;
    renderer.setClearColor(palette.fog.color, 1);
    const direction = ComputeSunDirection();
    skyDome.userData.uniforms.uSunDirection.value.copy(direction);
    waterMaterial.userData.uniforms.uSunDirection.value.copy(direction);
    sunLight.color.setHex(palette.sun.color);
    sunLight.intensity = palette.sun.intensity;
    hemisphereLight.color.setHex(palette.ambient.sky);
    hemisphereLight.groundColor.setHex(palette.ambient.ground);
    hemisphereLight.intensity = palette.ambient.intensity;
    if (csm) {
      csm.lightDirection.copy(direction).negate().normalize();
      csm.lightIntensity = palette.sun.intensity / Math.max(1, profile.cascades);
      for (const light of csm.lights) {
        light.intensity = csm.lightIntensity;
        light.color.setHex(palette.sun.color);
      }
    }
    ApplyGradeFromPalette();
  }

  function ApplyQualityToMaterials() {
    const terrainUniforms = terrainMaterial.userData.uniforms;
    terrainUniforms.uDetailStrength.value = profile.terrainDetail;
    terrainUniforms.uBumpStrength.value = profile.bumpStrength;
    waterMaterial.userData.uniforms.uDetail.value = profile.waterDetail;
    noiseTexture.anisotropy = profile.anisotropy;
    noiseTexture.needsUpdate = true;
    if (fogCloudMesh) fogCloudMesh.visible = profile.fogClouds;
    skyDome.userData.uniforms.uCloudOpacity.value = profile.skyClouds ? palette.sky.cloudOpacity : 0;
  }

  // -------------------------------------------------------------------------
  // 3.5 世界构建与同步
  // -------------------------------------------------------------------------

  function DisposeMesh(mesh, group) {
    if (!mesh) return;
    if (group) group.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
  }

  function DisposeWorld() {
    DisposeMesh(terrainMesh, terrainGroup); terrainMesh = null;
    DisposeMesh(waterMesh, terrainGroup); waterMesh = null;
    DisposeMesh(roadMesh, propGroup); roadMesh = null;
    DisposeMesh(railMesh, propGroup); railMesh = null;
    DisposeMesh(borderMesh, overlayGroup); borderMesh = null;
    DisposeMesh(overlayMesh, overlayGroup); overlayMesh = null;
    DisposeMesh(fogCloudMesh, overlayGroup); fogCloudMesh = null;
    DisposeMesh(hoverMesh, overlayGroup); hoverMesh = null;
    DisposeMesh(selectMesh, overlayGroup); selectMesh = null;
    structureSignature = "";
    borderSignature = "";
  }

  function ComputeStructureSignature() {
    let text = "";
    for (const entry of hexEntries) {
      text += `${entry.hex.road || 0}${entry.hex.railway ? 1 : 0}${entry.hex.railBroken ? 1 : 0}|`;
    }
    return text;
  }

  function ComputeBorderSignature() {
    let text = "";
    for (const entry of hexEntries) text += `${entry.hex.control || "-"},`;
    return text;
  }

  function RebuildStructures() {
    DisposeMesh(roadMesh, propGroup); roadMesh = null;
    DisposeMesh(railMesh, propGroup); railMesh = null;
    const roadGeometry = BuildRoadGeometry();
    if (roadGeometry) {
      roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
      roadMesh.name = "PrairieRoads";
      roadMesh.receiveShadow = true;
      roadMesh.castShadow = false;
      propGroup.add(roadMesh);
    }
    const railGeometry = BuildRailGeometry();
    if (railGeometry) {
      railMesh = new THREE.Mesh(railGeometry, railMaterial);
      railMesh.name = "PrairieRails";
      railMesh.receiveShadow = true;
      railMesh.castShadow = true;
      propGroup.add(railMesh);
    }
  }

  function RebuildBorders() {
    DisposeMesh(borderMesh, overlayGroup); borderMesh = null;
    const geometry = BuildBorderGeometry();
    if (!geometry) return;
    borderMesh = new THREE.Mesh(geometry, borderMaterial);
    borderMesh.name = "PrairieBorders";
    borderMesh.renderOrder = 4;
    overlayGroup.add(borderMesh);
  }

  function BuildWorld(state) {
    if (!state || !state.map) {
      if (typeof console !== "undefined") console.warn("BuildWorld: state.map 缺失，跳过世界构建");
      return;
    }
    currentState = state;
    DisposeWorld();
    if (!BuildHexIndex(state)) return;
    CreateStateTextures();

    palette = CreateSeasonPalette(state.eraKey, state.turn);
    paletteSignature = `${state.eraKey}:${state.turn}`;
    ApplyPaletteToScene();

    const terrainGeometry = BuildTerrainGeometry();
    if (terrainGeometry) {
      terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
      terrainMesh.name = "PrairieTerrain";
      terrainMesh.castShadow = true;
      terrainMesh.receiveShadow = true;
      terrainGroup.add(terrainMesh);
    }

    const waterGeometry = BuildWaterGeometry();
    if (waterGeometry) {
      waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      waterMesh.name = "PrairieWater";
      waterMesh.renderOrder = 2;
      terrainGroup.add(waterMesh);
    }

    const overlayGeometry = BuildOverlayGeometry();
    if (overlayGeometry) {
      overlayMesh = new THREE.Mesh(overlayGeometry, overlayMaterial);
      overlayMesh.name = "PrairieHighlightCarpet";
      overlayMesh.renderOrder = 6;
      overlayMesh.frustumCulled = false;
      overlayGroup.add(overlayMesh);
    }

    const fogGeometry = BuildFogCloudGeometry();
    if (fogGeometry) {
      fogCloudMesh = new THREE.Mesh(fogGeometry, fogOfWarMaterial);
      fogCloudMesh.name = "PrairieFogClouds";
      fogCloudMesh.renderOrder = 8;
      fogCloudMesh.frustumCulled = false;
      fogCloudMesh.visible = profile.fogClouds;
      overlayGroup.add(fogCloudMesh);
    }

    const hoverGeometry = BuildHoverOutlineGeometry();
    if (hoverGeometry) {
      hoverMesh = new THREE.Mesh(hoverGeometry, hoverMaterial);
      hoverMesh.name = "PrairieHoverOutline";
      hoverMesh.renderOrder = 10;
      hoverMesh.visible = false;
      overlayGroup.add(hoverMesh);
    }

    selectMesh = new THREE.Mesh(BuildSelectRingGeometry(), selectMaterial);
    selectMesh.name = "PrairieSelectRing";
    selectMesh.renderOrder = 11;
    selectMesh.visible = false;
    overlayGroup.add(selectMesh);

    RebuildStructures();
    structureSignature = ComputeStructureSignature();
    RebuildBorders();
    borderSignature = ComputeBorderSignature();

    WriteHexState();
    RewriteHighlightTexture();
    RebuildLighting();
    RebuildComposer();
    ApplyQualityToMaterials();

    // 初始镜头：对准起始点或地图中心
    const startKey = state.map.startKey || (state.bases && state.bases[0] && state.bases[0].key) || null;
    const startEntry = startKey ? hexByKey.get(startKey) : null;
    const targetX = startEntry ? startEntry.x : mapBounds.centerX;
    const targetZ = startEntry ? startEntry.z : mapBounds.centerZ;
    const targetY = startEntry ? startEntry.topY : mapBounds.averageTopY;
    controls.target.set(targetX, targetY, targetZ);
    const distance = options.cameraDistance || 26;
    camera.position.set(targetX + distance * 0.35, targetY + distance * 0.72, targetZ + distance * 0.60);
    controls.update();
    Resize();
  }

  function SyncWorld(state) {
    if (!state || !state.map || !hexEntries.length) return;
    currentState = state;
    // 规则层用不可变更新替换 hex 对象，这里重新绑定引用
    let terrainChanged = false;
    for (const entry of hexEntries) {
      const hex = state.map.hexes[entry.key];
      if (!hex) continue;
      if (hex.terrain !== entry.hex.terrain) {
        entry.profile = ResolveTerrainProfile(hex.terrain, terrainDefinitions);
        terrainChanged = true;
      }
      entry.hex = hex;
      entry.moisture = Clamp01(Number(hex.moisture) || 0);
    }
    // 地形被改写（如水淹/开荒）时只重刷顶点色，几何结构保持不变
    if (terrainChanged) RefreshTerrainColors();

    const nextPaletteSignature = `${state.eraKey}:${state.turn}`;
    if (nextPaletteSignature !== paletteSignature) {
      paletteSignature = nextPaletteSignature;
      palette = CreateSeasonPalette(state.eraKey, state.turn);
      ApplyPaletteToScene();
      if (csm) {
        csm.lightDirection.copy(ComputeSunDirection()).negate().normalize();
        csm.updateFrustums();
      }
    }

    WriteHexState();

    const nextStructureSignature = ComputeStructureSignature();
    if (nextStructureSignature !== structureSignature) {
      structureSignature = nextStructureSignature;
      RebuildStructures();
      if (csm) for (const material of standardMaterials) if (!material.defines || !material.defines.USE_CSM) AttachCsmToMaterial(material);
    }

    const nextBorderSignature = ComputeBorderSignature();
    if (nextBorderSignature !== borderSignature) {
      borderSignature = nextBorderSignature;
      RebuildBorders();
    }

    if (hoverKey && !hexByKey.has(hoverKey)) SetHoverHex(null);
    if (selectedKey && !hexByKey.has(selectedKey)) SetSelectedHex(null);
  }

  // -------------------------------------------------------------------------
  // 3.6 交互
  // -------------------------------------------------------------------------

  function SetHoverHex(key) {
    hoverKey = key || null;
    if (!hoverMesh) return;
    const entry = hoverKey ? hexByKey.get(hoverKey) : null;
    if (!entry) { hoverMesh.visible = false; return; }
    hoverMesh.visible = true;
    // 顶面有起伏，描边环需要略高于地块高台，避免被山尖穿插
    hoverMesh.position.set(entry.x, entry.topY + 0.075, entry.z);
  }

  function SetSelectedHex(key) {
    selectedKey = key || null;
    if (!selectMesh) return;
    const entry = selectedKey ? hexByKey.get(selectedKey) : null;
    if (!entry) { selectMesh.visible = false; return; }
    selectMesh.visible = true;
    selectMesh.position.set(entry.x, entry.topY + worldConfig.overlayLift + 0.006, entry.z);
  }

  /** keys 为空数组时清空该 kind；keys 为 null/undefined 时清空全部高亮。 */
  function SetHighlight(keys, kind) {
    if (keys === null || keys === undefined) {
      highlightByKind.clear();
      RewriteHighlightTexture();
      return;
    }
    const kindName = highlightKinds.indexOf(kind) >= 0 ? kind : highlightKinds[0];
    const keySet = new Set();
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      if (typeof key === "string") keySet.add(key);
      else if (key && typeof key.key === "string") keySet.add(key.key);
      else if (key && Number.isFinite(key.q) && Number.isFinite(key.r)) keySet.add(HexKey(key.q, key.r));
    }
    if (keySet.size === 0) highlightByKind.delete(kindName);
    else highlightByKind.set(kindName, keySet);
    RewriteHighlightTexture();
  }

  /**
   * 兜底：用水平面迭代反解轴向坐标。先按平均高度求交，再用命中格的实际高台高度
   * 修正平面重来一次，两三步即收敛。不处理遮挡，只在射线越过高度场时使用。
   */
  function PickByIteratedPlane() {
    let planeY = mapBounds.averageTopY;
    let resolvedKey = null;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      pickPlane.set(pickPlane.normal.set(0, 1, 0), -planeY);
      if (!raycaster.ray.intersectPlane(pickPlane, pickPoint)) return resolvedKey;
      const axial = WorldToHex(pickPoint.x, pickPoint.z, hexSize);
      const key = HexKey(axial.q, axial.r);
      const entry = hexByKey.get(key);
      if (!entry) return null;
      if (resolvedKey === key) break;
      resolvedKey = key;
      planeY = entry.topY;
    }
    return resolvedKey;
  }

  /**
   * 主拾取路径：把地块顶面当成高度场，沿射线步进求第一个"射线高度落到该格高台之下"
   * 的位置，再做几次二分细化。
   * 相比对 4.7 万三角的合并网格做 Raycaster 暴力求交（≈3.5 ms），这里是 O(跨越格数)，
   * 约 0.02 ms，并且天然正确处理"前方山峰遮挡后方谷地"与"点在侧壁上"两种情况。
   */
  function PickByHeightField() {
    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;
    if (direction.y > -1e-5) return null;               // 视线水平或朝上，打不到地面
    const ceiling = mapBounds.maxTopY + 0.45;           // 最高峰顶（含隆起余量）
    const floor = mapBounds.minTopY - 1.0;
    let travel = Math.max(0, (ceiling - origin.y) / direction.y);
    const limit = Math.max(travel, (floor - origin.y) / direction.y);
    const step = 0.26;
    let previousTravel = travel;
    let hitEntry = null;

    while (travel <= limit) {
      const x = origin.x + direction.x * travel;
      const y = origin.y + direction.y * travel;
      const z = origin.z + direction.z * travel;
      const axial = WorldToHex(x, z, hexSize);
      const entry = hexByKey.get(HexKey(axial.q, axial.r));
      if (entry && y <= entry.topY) { hitEntry = entry; break; }
      previousTravel = travel;
      travel += step;
    }
    if (!hitEntry) return null;

    // 二分细化到穿透点，再重新取格，消除步长带来的边界误差
    let low = previousTravel;
    let high = travel;
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const middle = (low + high) * 0.5;
      const x = origin.x + direction.x * middle;
      const y = origin.y + direction.y * middle;
      const z = origin.z + direction.z * middle;
      const axial = WorldToHex(x, z, hexSize);
      const entry = hexByKey.get(HexKey(axial.q, axial.r));
      if (entry && y <= entry.topY) high = middle;
      else low = middle;
    }
    const x = origin.x + direction.x * high;
    const z = origin.z + direction.z * high;
    const axial = WorldToHex(x, z, hexSize);
    const key = HexKey(axial.q, axial.r);
    return hexByKey.has(key) ? key : hitEntry.key;
  }

  function PickHex(clientX, clientY) {
    if (!hexEntries.length) return null;
    const roundedX = Math.round(clientX);
    const roundedY = Math.round(clientY);
    if (roundedX === pickCacheX && roundedY === pickCacheY) return pickCacheKey;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointerVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerVector, camera);

    let resolvedKey = PickByHeightField();
    if (!resolvedKey) resolvedKey = PickByIteratedPlane();

    pickCacheX = roundedX;
    pickCacheY = roundedY;
    pickCacheKey = resolvedKey;
    return resolvedKey;
  }

  /** 平滑飞向某格；返回 Promise，可 await。 */
  function FocusHex(key, focusOptions = {}) {
    const entry = hexByKey.get(key);
    if (!entry) return Promise.resolve(false);
    const duration = Number.isFinite(focusOptions.duration) ? Math.max(0, focusOptions.duration) : 0.85;
    const currentOffset = scratchVector.copy(camera.position).sub(controls.target);
    const currentDistance = currentOffset.length() || 26;
    const targetDistance = Clamp(
      Number.isFinite(focusOptions.distance) ? focusOptions.distance : currentDistance,
      controls.minDistance, controls.maxDistance
    );
    const toTarget = new THREE.Vector3(entry.x, entry.topY, entry.z);
    const direction = currentOffset.clone().normalize();
    if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.0001) direction.set(0.35, 0.72, 0.60).normalize();
    const toPosition = toTarget.clone().addScaledVector(direction, targetDistance);

    if (duration <= 0 || focusOptions.immediate) {
      controls.target.copy(toTarget);
      camera.position.copy(toPosition);
      controls.update();
      return Promise.resolve(true);
    }
    if (focusFlight && focusFlight.resolve) focusFlight.resolve(false);
    return new Promise((resolve) => {
      focusFlight = {
        fromTarget: controls.target.clone(),
        toTarget,
        fromPosition: camera.position.clone(),
        toPosition,
        elapsed: 0,
        duration,
        resolve,
      };
    });
  }

  function UpdateFocusFlight(deltaSeconds) {
    if (!focusFlight) return;
    focusFlight.elapsed += deltaSeconds;
    const raw = Clamp01(focusFlight.elapsed / focusFlight.duration);
    // easeInOutCubic
    const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    controls.target.lerpVectors(focusFlight.fromTarget, focusFlight.toTarget, eased);
    camera.position.lerpVectors(focusFlight.fromPosition, focusFlight.toPosition, eased);
    if (raw >= 1) {
      const resolve = focusFlight.resolve;
      focusFlight = null;
      if (resolve) resolve(true);
    }
  }

  function ClampCameraToBounds() {
    const clampedX = Clamp(controls.target.x, mapBounds.minX, mapBounds.maxX);
    const clampedZ = Clamp(controls.target.z, mapBounds.minZ, mapBounds.maxZ);
    const clampedY = Clamp(controls.target.y, mapBounds.minTopY - 1, mapBounds.maxTopY + 2);
    if (clampedX !== controls.target.x || clampedZ !== controls.target.z || clampedY !== controls.target.y) {
      camera.position.x += clampedX - controls.target.x;
      camera.position.y += clampedY - controls.target.y;
      camera.position.z += clampedZ - controls.target.z;
      controls.target.set(clampedX, clampedY, clampedZ);
    }
  }

  // -------------------------------------------------------------------------
  // 3.7 逐帧
  // -------------------------------------------------------------------------

  function UpdateTimeUniforms() {
    terrainMaterial.userData.uniforms.uTime.value = elapsedTime;
    waterMaterial.userData.uniforms.uTime.value = elapsedTime;
    fogOfWarMaterial.userData.uniforms.uTime.value = elapsedTime;
    overlayMaterial.userData.uniforms.uTime.value = elapsedTime;
    hoverMaterial.userData.uniforms.uTime.value = elapsedTime;
    selectMaterial.userData.uniforms.uTime.value = elapsedTime;
    skyDome.userData.uniforms.uTime.value = elapsedTime;
    if (gradePass) gradePass.uniforms.uTime.value = elapsedTime;
  }

  function Update(deltaSeconds) {
    if (disposed) return;
    const delta = Number.isFinite(deltaSeconds) ? Clamp(deltaSeconds, 0, 0.25) : 1 / 60;
    elapsedTime += delta;

    UpdateFocusFlight(delta);
    controls.update();
    ClampCameraToBounds();

    skyDome.position.copy(camera.position);
    UpdateTimeUniforms();

    if (csm) {
      csm.update();
    } else if (sunLight.visible) {
      const direction = ComputeSunDirection();
      sunLight.position.copy(controls.target).addScaledVector(direction, 60);
      sunLight.target.position.copy(controls.target);
      sunLight.target.updateMatrixWorld();
    }

    if (handle.effects && typeof handle.effects.Update === "function") {
      handle.effects.Update(delta, elapsedTime);
    }

    // 拾取缓存每帧失效，避免相机移动后返回过期结果
    pickCacheX = -99999;
    pickCacheY = -99999;

    if (composer) composer.render(delta);
    else renderer.render(scene, camera);
  }

  function Resize() {
    if (disposed) return;
    const width = canvas.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1280);
    const height = canvas.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 720);
    if (!width || !height) return;
    const devicePixelRatio = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatioCap));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    }
    if (gradePass) {
      gradePass.uniforms.uResolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
    }
    if (csm) csm.updateFrustums();
  }

  function SetQuality(level) {
    if (!qualityProfiles[level] || level === quality) return quality;
    quality = level;
    profile = qualityProfiles[quality];
    handle.quality = quality;
    handle.qualityProfile = profile;
    ApplyQualityToMaterials();
    RebuildLighting();
    RebuildComposer();
    Resize();
    return quality;
  }

  function Dispose() {
    if (disposed) return;
    disposed = true;
    if (focusFlight && focusFlight.resolve) { focusFlight.resolve(false); focusFlight = null; }
    DisposeComposer();
    DisposeCsm();
    DisposeWorld();
    DisposeStateTextures();
    controls.dispose();
    scene.remove(terrainGroup, overlayGroup, propGroup, skyDome, sunLight, sunLight.target, hemisphereLight, fillLight);
    if (skyDome.geometry) skyDome.geometry.dispose();
    if (sunLight.shadow && sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
    // 本实例独占的材质逐个释放（Script_Materials 的工厂每次调用都返回新实例）
    for (const material of [terrainMaterial, waterMaterial, fogOfWarMaterial, overlayMaterial,
      hoverMaterial, selectMaterial, skyDome.material, ...localMaterials]) {
      if (material && typeof material.dispose === "function") material.dispose();
    }
    hexEntries.length = 0;
    hexByKey.clear();
    highlightByKind.clear();
    colorLowCache.clear();
    colorHighCache.clear();
    strataLowCache.clear();
    strataHighCache.clear();
    // 共享的程序化纹理缓存只在最后一个渲染器销毁时拆除
    liveRendererCount = Math.max(0, liveRendererCount - 1);
    if (liveRendererCount === 0) DisposeMaterialCache();
    // 只调 dispose()，不调 forceContextLoss()：后者会让同一张 canvas 无法再次创建渲染器
    renderer.dispose();
    handle.composer = null;
    handle.effects = null;
    currentState = null;
  }

  // -------------------------------------------------------------------------
  // 3.8 句柄
  // -------------------------------------------------------------------------

  const handle = {
    scene,
    camera,
    controls,
    renderer,
    composer: null,
    effects: null,
    quality,
    qualityProfile: profile,
    BuildWorld,
    SyncWorld,
    SetHoverHex,
    SetSelectedHex,
    SetHighlight,
    PickHex,
    FocusHex,
    Update,
    Resize,
    SetQuality,
    Dispose,
    // 附加工具：主流程 / 特效模块常用
    /** 主流程若已同步 import 了 Data_Terrain，可直接注入，无需等待内部的动态 import。 */
    SetTerrainDefinitions(definitions) {
      if (!definitions || typeof definitions !== "object") return false;
      terrainDefinitions = definitions;
      if (terrainMesh) {
        for (const entry of hexEntries) entry.profile = ResolveTerrainProfile(entry.hex.terrain, terrainDefinitions);
        RefreshTerrainColors();
      }
      return true;
    },
    GetPalette() { return palette; },
    GetHexWorldPosition(key, lift = 0) {
      const entry = hexByKey.get(key);
      if (!entry) return null;
      return new THREE.Vector3(entry.x, entry.topY + lift, entry.z);
    },
    GetHexTopHeight(key) {
      const entry = hexByKey.get(key);
      return entry ? entry.topY : 0;
    },
    GetMapBounds() { return Object.assign({}, mapBounds); },
    CreateBannerTexture,
    ProjectHexToScreen(key, lift = 0.6) {
      const entry = hexByKey.get(key);
      if (!entry) return null;
      scratchVector.set(entry.x, entry.topY + lift, entry.z).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (scratchVector.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-scratchVector.y * 0.5 + 0.5) * rect.height,
        visible: scratchVector.z < 1,
      };
    },
  };

  RebuildLighting();
  RebuildComposer();
  ApplyPaletteToScene();
  ApplyQualityToMaterials();
  Resize();

  return handle;
}
