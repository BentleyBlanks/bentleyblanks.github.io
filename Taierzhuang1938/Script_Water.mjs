// 《滕县 一九三八》程序化水面 —— 参考 Wave Harmonic 的 Crest（Unity/Godot 海洋系统）
// 的分层思路，裁剪到本作管线能负担的那几层。
//
// ---------------------------------------------------------------------------
// Crest 那套里我们取什么、舍什么
//
// 取（对一条 10.5 m 宽的护城河与一条 30 m 宽的城河仍然成立的）：
//   1) **Gerstner 波位移**：顶点级三波叠加，波峰变尖、波谷变宽 —— 正弦波
//      一眼假的地方就是峰谷对称。振幅按「三月枯水、无风细浪」压到厘米级，
//      不是海面那种半米涌浪。
//   2) **屏幕空间水深**：Crest 用海床深度贴图驱动浅水吸收与岸线泡沫；这里
//      没有那张贴图，但 PostPipeline 的深度法线预通道（rtNormalDepth.w =
//      线性视深）就是现成的替代 —— 水面像元减去它身后河床/岸壁的像元，
//      得到的视差深度直接喂吸收曲线与泡沫带。桥墩、柳根、人腿插进水里
//      都会自动得到一圈岸线泡沫，不用给任何物体单独做处理。
//   3) **菲涅尔天空反射 + 太阳高光**：Crest 反射的是 cubemap；这里借
//      SkyDome 的 uniform（天顶色/地平线色/地面反照/太阳方向与颜色）
//      解析式算一份 —— 换时段预设时水面反射跟着天一起变，零额外采样。
//   4) **细节法线两层滚动 + 距离淡出**：高频涟漪全在片元里做，顶点网格
//      不用为它们加密；远处淡出防闪烁（Crest 的 distant normals 同一思路）。
//   5) **浪尖泡沫**：Gerstner 相位的压缩量当尖锐度，配噪声打碎。
//
// 舍：FFT 波谱、flow map、实时平面反射、水下后处理 —— 一条护城河用不上，
// 预算也不许。雾不在这里做：合成 pass 按预通道深度统一上雾（水面对预通道
// 是 skipNormalDepth，雾吃的是它身后河床的深度，差几十厘米，看不出来）。
//
// ---------------------------------------------------------------------------
// 管线契约（改这里之前先读 Script_Post.mjs 的 MarkNoPrepass 注释块）：
//   · 材质 transparent + depthWrite=false → 建完立刻 MarkNoPrepass；
//   · 整片铺开的大面积半透明面必须再挂 userData.skipNormalDepth = true，
//     否则它会拿自己的着色器画进预通道，把水面颜色写进法线、把 alpha 写进
//     「线性视深」—— SSAO 与雾的判据当场作废（天空穹当年就是这么炸的）；
//   · 渲染器 toneMapping=NoToneMapping、输出线性 HDR，tonemap 在 Composite：
//     这里输出的颜色一律是**线性 HDR 辐亮度**，不许自己先做 gamma 或 ACES；
//   · 时间与相机相关的共享 uniform 由 UpdateWaterSurfaces() 每帧推一次，
//     调用点是 Script_Main.RenderScene（与 vfx.SetDepthSource 同一批账）。
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { MarkNoPrepass } from "./Script_Post.mjs";

// ---------------------------------------------------------------------------
// 共享 uniform：所有水面材质引用同一批对象，UpdateWaterSurfaces 改一次全生效。
// ---------------------------------------------------------------------------

const sharedUniforms = {
  uTime: { value: 0 },
  uSceneDepth: { value: null },          // PostPipeline.NormalDepthTexture（xyz 法线 / w 线性视深）
  uDepthValid: { value: 0 },             // 深度源还没接上时按深水处理，岸线泡沫静默关闭
  uResolution: { value: new THREE.Vector2(1, 1) },
};

// Crest 用可平铺法线贴图承载高频细浪。这里不引入来源不明的外部资产：启动时
// 一次性烘一张严格周期的 128² DataTexture，片元阶段只需 4 次纹理采样，替掉旧版
// 每像素十余次 value-noise。纹理的频率都是整数，所以四边导数也连续，不会露接缝。
let waterNormalTexture = null;
function GetWaterNormalTexture() {
  if (waterNormalTexture) return waterNormalTexture;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const components = [
    [1, 2, 0.90, 0.3], [2, -3, 0.55, 1.7], [4, 1, 0.34, 3.1],
    [-3, 5, 0.24, 4.6], [7, 4, 0.15, 2.2], [9, -6, 0.10, 5.4],
  ];
  const heightAt = (ix, iy) => {
    const x = ((ix % size) + size) % size / size;
    const y = ((iy % size) + size) % size / size;
    let height = 0;
    for (const [fx, fy, amplitude, phase] of components) {
      height += Math.sin((fx * x + fy * y) * Math.PI * 2 + phase) * amplitude;
    }
    return height;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const height = heightAt(x, y);
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * 2.8;
      const dz = (heightAt(x, y + 1) - heightAt(x, y - 1)) * 2.8;
      const invLength = 1 / Math.hypot(dx, 1, dz);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round((-dx * invLength * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((-dz * invLength * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((invLength * 0.5 + 0.5) * 255);
      data[offset + 3] = Math.round((height * 0.20 + 0.5) * 255);
    }
  }
  waterNormalTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  waterNormalTexture.name = "Texture_WaterNormals";
  waterNormalTexture.wrapS = THREE.RepeatWrapping;
  waterNormalTexture.wrapT = THREE.RepeatWrapping;
  waterNormalTexture.magFilter = THREE.LinearFilter;
  waterNormalTexture.minFilter = THREE.LinearMipmapLinearFilter;
  waterNormalTexture.generateMipmaps = true;
  waterNormalTexture.colorSpace = THREE.NoColorSpace;
  waterNormalTexture.needsUpdate = true;
  return waterNormalTexture;
}

/** 借 SkyDome 的 uniform（Script_Main 在建完天空后调一次）。 */
let skyUniformsRef = null;
export function SetWaterSkyUniforms(skyUniforms) { skyUniformsRef = skyUniforms; }

// ---------------------------------------------------------------------------
// 两档预设。颜色一律从 Data_Tengxian.PALETTE.moatWater（浑浊 #6B7060）派生，
// new THREE.Color(hex) 在 ColorManagement 下自动转线性 —— 直接当反照率用。
// ---------------------------------------------------------------------------

function LinearColor(hex) { return new THREE.Color(hex); }

const WATER_PRESETS = {
  // 护城河：窄、滞水、泥沙重。波长压短、流速近零，吸收快（一脚深的岸边就见底）。
  moat: {
    waves: [
      { dir: [0.94, 0.34], len: 16.0, amp: 0.028 },
      { dir: [-0.57, 0.82], len: 9.2, amp: 0.014 },
      { dir: [0.83, -0.55], len: 5.4, amp: 0.007 },
    ],
    chop: 0.50,
    timeScale: 0.85,
    flow: [0.00, 0.00],
    absorb: 0.46,
    shallowColor: 0x8A9078,
    deepColor: 0x3E443C,
    foamColor: 0xB8B2A0,
    foamWidth: 0.42,
    foamStrength: 0.80,
    detailStrength: 0.30,
  },
  // 荆河：三十米宽的活水，顺流有整体漂移，浪比濠里略长略高。
  river: {
    waves: [
      { dir: [0.10, 0.99], len: 19.0, amp: 0.034 },
      { dir: [-0.86, 0.51], len: 8.6, amp: 0.015 },
      { dir: [0.66, -0.75], len: 5.2, amp: 0.008 },
    ],
    chop: 0.55,
    timeScale: 1.0,
    flow: [0.04, 0.45],
    absorb: 0.34,
    shallowColor: 0x87927B,
    deepColor: 0x39443C,
    foamColor: 0xBDB7A4,
    foamWidth: 0.60,
    foamStrength: 1.0,
    detailStrength: 0.36,
  },
};

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

const WATER_VERT = /* glsl */`
uniform float uTime;
uniform float uAmpScale;
uniform float uChop;
uniform vec2 uFlow;
uniform float uTimeScale;

varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying float vSharpness;
varying float vViewZ;

// 三波 Gerstner。波长/方向是常量表（按预设生成），位置随 uFlow 整体漂移。
__WAVE_TABLE__

void main() {
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  float waterTime = uTime * uTimeScale;
  vec2 advected = worldPos.xz - uFlow * waterTime;

  vec3 disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float sharp = 0.0;
  float weightSum = 0.0001;

  for (int i = 0; i < WAVE_COUNT; i++) {
    vec2 dir = WAVE_DIR(i);
    float k = WAVE_K(i);
    float w = WAVE_W(i);
    float amp = WAVE_AMP(i) * uAmpScale;
    float phase = k * dot(dir, advected) - w * waterTime;
    float s = sin(phase), c = cos(phase);
    // 水平位移系数取常数 chop（不做 GPU Gems 那套 Q 归一化）：
    // 这里的浪是厘米级装饰，横向摆动按振幅同量级给一点就够，归一化反而算出过冲。
    float q = uChop;
    disp.x += q * amp * dir.x * c;
    disp.z += q * amp * dir.y * c;
    disp.y += amp * s;
    // 空间导数必须乘波数 k；旧版误乘了角频率 w，长波法线被放大约五倍，
    // 水面会像皱铝箔一样乱闪。w 只管相位随时间推进。
    n.x -= dir.x * k * amp * c;
    n.z -= dir.y * k * amp * c;
    n.y -= q * k * amp * s;
    sharp += (s * 0.5 + 0.5) * (amp * k);
    weightSum += amp * k;
  }

  vSharpness = sharp / weightSum;
  vWaveNormal = normalize(n);
  vec3 displaced = worldPos + disp;
  vWorldPos = displaced;
  vec4 viewPos = viewMatrix * vec4(displaced, 1.0);
  vViewZ = -viewPos.z;
  gl_Position = projectionMatrix * viewPos;
}
`;

const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform sampler2D uSceneDepth;
uniform sampler2D uNormalMap;
uniform float uDepthValid;
uniform vec2 uResolution;
uniform vec2 uFlow;
uniform float uTimeScale;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;

uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uFoamColor;
uniform float uAbsorb;
uniform float uFoamWidth;
uniform float uFoamStrength;
uniform float uDetailStrength;

varying vec3 vWorldPos;
varying vec3 vWaveNormal;
varying float vSharpness;
varying float vViewZ;

// Crest 的 flow normal 双相采样：一相回卷时另一相权重最大，长时间流动不会在
// UV 重置点跳一下。对护城河给极慢风纹，对荆河则沿 uFlow 顺流。
vec4 SampleFlowNormal(vec2 uv, vec2 flow, float cycle) {
  float phase0 = fract(cycle);
  float phase1 = fract(cycle + 0.5);
  float blend = abs(phase0 * 2.0 - 1.0);
  vec4 sample0 = texture2D(uNormalMap, uv - flow * phase0);
  vec4 sample1 = texture2D(uNormalMap, uv - flow * phase1);
  return mix(sample0, sample1, blend);
}

float BehindSurfaceDepth(vec2 uv, float surfaceZ) {
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  float best = 10000.0;
  float d = texture2D(uSceneDepth, uv).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv + vec2(texel.x, 0.0)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv - vec2(texel.x, 0.0)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv + vec2(0.0, texel.y)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  d = texture2D(uSceneDepth, uv - vec2(0.0, texel.y)).w;
  if (d > surfaceZ + 0.001) best = min(best, d - surfaceZ);
  return best > 9999.0 ? 30.0 : best;
}

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float dist = length(cameraPosition - vWorldPos);
  float waterTime = uTime * uTimeScale;

  // --- 法线：Gerstner 解析法线 + 两档可平铺流动法线 ---
  float detailFade = uDetailStrength * (1.0 - smoothstep(35.0, 150.0, dist));
  vec2 flowDirection = length(uFlow) > 0.01 ? normalize(uFlow) : normalize(vec2(0.72, 0.28));
  vec4 detail0 = SampleFlowNormal(vWorldPos.xz * 0.115, flowDirection * 0.42,
    waterTime * 0.070);
  vec2 rotated = vec2(vWorldPos.x - vWorldPos.z, vWorldPos.x + vWorldPos.z);
  vec4 detail1 = SampleFlowNormal(rotated * 0.245, -flowDirection.yx * 0.36,
    waterTime * 0.105 + 0.37);
  vec2 grad = ((detail0.rg * 2.0 - 1.0) * 0.66 + (detail1.rg * 2.0 - 1.0) * 0.34)
    * detailFade;
  vec3 N = normalize(vWaveNormal + vec3(grad.x, 0.0, grad.y));
  // 远处把波浪整体拍平：厘米级浪在两百米外只剩闪烁噪声
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(180.0, 420.0, dist) * 0.5));

  // --- 屏幕空间水深（Crest 的 sea-floor depth 思路，深度来源换成本作的预通道）---
  vec2 suv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  // rtNormalDepth.w 与 vViewZ 都是从相机向前递增的正数：河床在水面后方，
  // 所以必须 sceneZ - vViewZ。旧版写反后，整条河都被判成 0 深岸线。
  float rayDepth = BehindSurfaceDepth(suv, vViewZ);
  if (uDepthValid < 0.5) rayDepth = 30.0;   // 深度源没接上（探针页/首帧）：按深水渲染
  // 视差深度换算成竖直水深：视线越平，同样的视差对应越深的水柱
  float depth = rayDepth * clamp(abs(V.y), 0.22, 1.0);

  // --- 天光辐亮度近似（借天空预设的四个量，昼夜自动跟随）---
  float sunUp = clamp(uSunDirection.y, 0.0, 1.0);
  vec3 irradiance = uZenith * 0.52 + uHorizon * 0.38 + uSunColor * (0.22 * sunUp);

  // --- 水体：浅水吸收（浑浊的鲁南河水，不是加勒比海）---
  float absorb = exp(-depth * uAbsorb);
  vec3 body = mix(uDeepColor, uShallowColor, absorb) * irradiance;
  float shallow = 1.0 - smoothstep(0.18, 1.8, depth);
  float caustic = pow(clamp(1.0 - abs(detail0.a - detail1.a) * 3.2, 0.0, 1.0), 7.0);
  body += uSunColor * caustic * shallow * sunUp * 0.035;

  // --- 泡沫：岸线带 + 浪尖 ---
  float foamNoise = clamp(detail0.a * 0.64 + detail1.a * 0.36, 0.0, 1.0);
  float band = sin(depth * 15.0 - waterTime * 1.8 + foamNoise * 5.0) * 0.5 + 0.5;
  float shoreMask = 1.0 - smoothstep(0.025, uFoamWidth * (0.72 + foamNoise * 0.55), depth);
  float shore = shoreMask * (0.34 + 0.66 * band)
    + (1.0 - smoothstep(0.018, 0.085, depth)) * 0.62;
  float crest = smoothstep(0.66, 0.94, vSharpness + (foamNoise - 0.5) * 0.20);
  float foamTex = smoothstep(0.43, 0.67, foamNoise + (shore + crest) * 0.16);
  float foam = clamp((shore * 0.92 + crest * 0.60) * foamTex * uFoamStrength, 0.0, 1.0);

  // --- 反射与高光 ---
  vec3 R = reflect(-V, N);
  float up = clamp(R.y, -1.0, 1.0);
  vec3 refl = mix(uHorizon, uZenith, pow(clamp(up, 0.0, 1.0), 0.42));
  refl = mix(refl, uGround, smoothstep(0.02, -0.08, up));
  float sunDot = max(dot(R, normalize(uSunDirection)), 0.0);
  vec3 spec = uSunColor * (pow(sunDot, 420.0) * 1.9 + pow(sunDot, 42.0) * 0.18);

  float fresnel = 0.022 + 0.978 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // --- 合成 ---
  vec3 scatter = uSunColor * pow(max(dot(V, -normalize(uSunDirection)), 0.0), 3.0)
    * shallow * (1.0 - fresnel) * 0.045;
  vec3 col = mix(body, refl, fresnel) + spec * (0.35 + 0.65 * fresnel) + scatter;
  float foamLight = 0.74 + 0.26 * max(dot(N, normalize(uSunDirection)), 0.0);
  col = mix(col, uFoamColor * irradiance * foamLight + spec * 0.10, foam);

  float alpha = mix(0.52, 0.94, 1.0 - absorb);
  alpha = clamp(max(alpha, foam * 0.96) + fresnel * 0.10, 0.0, 0.97);

  gl_FragColor = vec4(col, alpha);
}
`;

/** 把一波表展开成 GLSL 常量数组（ShaderMaterial 里手写循环要下标常量）。 */
function WaveTableGlsl(waves) {
  const dirs = waves.map((w) => `vec2(${w.dir[0].toFixed(4)}, ${w.dir[1].toFixed(4)})`).join(", ");
  const ks = waves.map((w) => ((2 * Math.PI) / w.len).toFixed(6)).join(", ");
  const ws = waves.map((w) => Math.sqrt(9.8 * ((2 * Math.PI) / w.len)).toFixed(6)).join(", ");
  const amps = waves.map((w) => w.amp.toFixed(5)).join(", ");
  return `#define WAVE_COUNT ${waves.length}
const vec2 WAVE_DIRS[WAVE_COUNT] = vec2[](${dirs});
const float WAVE_KS[WAVE_COUNT] = float[](${ks});
const float WAVE_WS[WAVE_COUNT] = float[](${ws});
const float WAVE_AMPS[WAVE_COUNT] = float[](${amps});
vec2 WAVE_DIR(int i) { return WAVE_DIRS[i]; }
float WAVE_K(int i) { return WAVE_KS[i]; }
float WAVE_W(int i) { return WAVE_WS[i]; }
float WAVE_AMP(int i) { return WAVE_AMPS[i]; }
`;
}

// ---------------------------------------------------------------------------
// 材质缓存：同一 preset + flow 只建一份 ShaderMaterial（关卡重建复用，不泄漏）。
// ---------------------------------------------------------------------------

const materialCache = new Map();

function GetWaterMaterial(presetName, flowKey) {
  const key = `${presetName}|${flowKey}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const preset = WATER_PRESETS[presetName];
  if (!preset) throw new Error(`未知水面预设：${presetName}`);
  const skyU = skyUniformsRef;
  const fallbackSkyUniforms = {
    uZenith: { value: new THREE.Vector3(1.9, 2.35, 3.2) },
    uHorizon: { value: new THREE.Vector3(2.4, 2.46, 2.62) },
    uGround: { value: new THREE.Vector3(0.58, 0.52, 0.42) },
    uSunDirection: { value: new THREE.Vector3(0.2, 0.78, -0.59).normalize() },
    uSunColor: { value: new THREE.Vector3(1.0, 0.92, 0.78) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      uNormalMap: { value: GetWaterNormalTexture() },
      // 借天空 uniform 的同一批对象：换时段预设，水面的反射与光色跟着变
      ...(skyU ? {
        uZenith: skyU.uZenith, uHorizon: skyU.uHorizon, uGround: skyU.uGround,
        uSunDirection: skyU.uSunDirection, uSunColor: skyU.uSunColor,
      } : fallbackSkyUniforms),
      uShallowColor: { value: LinearColor(preset.shallowColor) },
      uDeepColor: { value: LinearColor(preset.deepColor) },
      uFoamColor: { value: LinearColor(preset.foamColor) },
      uAbsorb: { value: preset.absorb },
      uFoamWidth: { value: preset.foamWidth },
      uFoamStrength: { value: preset.foamStrength },
      uDetailStrength: { value: preset.detailStrength },
      uAmpScale: { value: 1 },
      uChop: { value: preset.chop },
      uTimeScale: { value: preset.timeScale },
      uFlow: { value: new THREE.Vector2(
        flowKey ? Number(flowKey.split("_")[0]) : preset.flow[0],
        flowKey ? Number(flowKey.split("_")[1]) : preset.flow[1]) },
    },
    vertexShader: WATER_VERT.replace("__WAVE_TABLE__", WaveTableGlsl(preset.waves)),
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,     // 蹲进濠里抬头还要看得见水面
    fog: false,                 // 雾收在 Composite pass 里
    toneMapped: false,
  });
  // 大面积半透明面：既不换材质进预通道（allowOverride），也整只藏出预通道
  //（skipNormalDepth 由 PostPipeline._CollectSkipped 读）—— 见文件头管线契约。
  MarkNoPrepass(material);
  materialCache.set(key, material);
  return material;
}

/**
 * 造一片水面网格并挂进场景。
 * @param {object} options
 *   geometry  已合批的水面几何（世界坐标，position+uv）
 *   preset    "moat" | "river"
 *   flow      可选 [vx,vz] 覆盖预设的整体漂移（米/秒）
 *   name      场景里的对象名
 */
export function CreateWaterSurface({ geometry, scene, preset = "moat", flow = null, name = "Water" }) {
  const flowKey = flow ? `${flow[0]}_${flow[1]}` : null;
  const mesh = new THREE.Mesh(geometry, GetWaterMaterial(preset, flowKey));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = name;
  mesh.userData.skipNormalDepth = true;
  scene.add(mesh);
  return mesh;
}

/**
 * 每帧推一次时间与深度源。调用点：Script_Main.RenderScene
 *（与 vfx.SetDepthSource 同一批账：预通道靶会被 SetSize 重建，纹理引用
 * 每帧都可能换，不能只在初始化接一次）。
 */
export function UpdateWaterSurfaces(dt, depthTexture, width, height) {
  sharedUniforms.uTime.value += Math.min(Math.max(dt, 0.0), 0.1);
  if (depthTexture) {
    sharedUniforms.uSceneDepth.value = depthTexture;
    sharedUniforms.uDepthValid.value = 1;
  } else {
    sharedUniforms.uDepthValid.value = 0;
  }
  sharedUniforms.uResolution.value.set(width || 1, height || 1);
}
