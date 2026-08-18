// 《血战台儿庄》程序化天空 + 基于图像的照明（IBL）。
//
// 为什么非要有 IBL：只打一盏平行光的场景，背光面必然是死黑一片 —— 那是 2005 年
// 的观感。真正拉开档次的是**间接光有颜色**：天空把冷蓝洒在背光面，地面把暖黄
// 反到人物下巴上。这里用 PMREMGenerator 把这张程序化天空烘成环境贴图，
// scene.environment 一挂，所有 MeshStandardMaterial 立刻吃到。
//
// 天空本身是解析式的（不是 Preetham 原版，是一套可控的美术化模型）：
// 天顶色 -> 地平线色的梯度 + 太阳盘 + 前向散射辉光 + 高空烟层 + 战场烟尘带。
// 台儿庄打了半个月，天上是有烟的 —— 一片干净的蓝天反而失真。

import * as THREE from "three";

const SKY_VERT = /* glsl */`
varying vec3 vWorldDirection;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;   // 永远贴在远平面
}
`;

const SKY_FRAG = /* glsl */`
uniform vec3 uSunDirection;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSunSize;
uniform float uGlowStrength;
uniform float uGlowSpread;
uniform float uSmoke;        // 战场烟尘的总量
uniform vec3 uSmokeColor;
uniform float uSmokeHeight;
uniform float uStars;
uniform float uTime;
varying vec3 vWorldDirection;

float Hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float Noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(Hash31(i + vec3(0,0,0)), Hash31(i + vec3(1,0,0)), f.x),
                 mix(Hash31(i + vec3(0,1,0)), Hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(Hash31(i + vec3(0,0,1)), Hash31(i + vec3(1,0,1)), f.x),
                 mix(Hash31(i + vec3(0,1,1)), Hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float Fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * Noise3(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDirection);
  float up = dir.y;
  float sunDot = dot(dir, normalize(uSunDirection));

  // --- 天顶到地平线的梯度：pow 决定"天有多高" ---
  float t = pow(clamp(1.0 - max(up, 0.0), 0.0, 1.0), 2.6);
  vec3 sky = mix(uZenith, uHorizon, t);

  // --- 前向散射：靠近太阳的一大片天要亮起来，这是"有大气"的关键 ---
  float glow = pow(max(sunDot * 0.5 + 0.5, 0.0), uGlowSpread);
  sky += uSunColor * glow * uGlowStrength;

  // --- 太阳盘：给足 HDR 值，泛光与 IBL 都靠它 ---
  float disk = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sunDot);
  sky += uSunColor * disk * uSunIntensity;

  // --- 高空烟／云：拉长的 fbm，越靠地平线越压扁 ---
  if (uSmoke > 0.001) {
    vec3 p = dir / max(abs(up) + 0.12, 0.06);
    // 事故：原来是 Fbm3(p * 0.9) 配 smoothstep(0.42, 0.86)。五倍频 fbm 的取值
    // 实际集中在 0.48 ± 0.08，0.86 这个上限相当于 +4.7σ —— 云项恒等于 0，
    // 白天四张的天全是一块 sRGB 234 的死白。频率提到 5.5 才有云团大小的团块，
    // 阈值窗口收到 0.445—0.615 才真的落在分布里被触发。
    float cloud = Fbm3(p * 5.5 + vec3(uTime * 0.006, 0.0, uTime * 0.004));
    cloud = smoothstep(0.445, 0.615, cloud) * smoothstep(-0.02, 0.22, up);
    // 烟被太阳打透的那一侧要亮：这一笔没有的话烟就是一块贴纸
    vec3 lit = mix(uSmokeColor, uSmokeColor * 2.4 + uSunColor * 0.25, pow(max(sunDot, 0.0), 3.0));
    sky = mix(sky, lit, clamp(cloud * uSmoke, 0.0, 0.94));
  }

  // --- 贴地的战场烟尘带：整场戏都在这层灰里 ---
  float haze = exp(-max(up, 0.0) / max(uSmokeHeight, 0.01));
  sky = mix(sky, uSmokeColor * (0.85 + glow * 0.6), haze * clamp(uSmoke * 0.75 + 0.18, 0.0, 0.85));

  // --- 地平线以下：地面反照（IBL 的下半球靠它，不然人物下巴死黑）---
  sky = mix(sky, uGround, smoothstep(0.0, -0.14, up));

  // --- 星（夜战关）---
  if (uStars > 0.001 && up > 0.0) {
    // 190 的格距在 1600×900 上一格有 4—8 px 宽，而 floor() 取的是整格常数 ——
    // 星星就是一个个硬边方块，还会被 FXAA 啃出十字，看着像屏幕坏点。
    // 900 让一格缩到 1—2 px，再乘一个格内径向衰减把方块磨成圆点。
    vec3 sp = dir * 900.0;
    float star = pow(Hash31(floor(sp)), 220.0)
      * (1.0 - smoothstep(0.15, 0.5, length(fract(sp) - 0.5)));
    sky += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.02, 0.35, up);
  }

  gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);
}
`;

/**
 * 时段预设。每一关按剧情选一个，关内可以插值过渡。
 * 数值单位是"线性 HDR"，配合 PostPipeline 的 exposure 一起看。
 */
export const SKY_PRESETS = {
  // 3 月 23 日黄昏：部队进城布防
  dusk: {
    sunElevation: 7.5, sunAzimuth: 262,
    zenith: [0.42, 0.62, 1.15], horizon: [4.20, 2.30, 1.05], ground: [0.46, 0.38, 0.30],
    sunColor: [1.0, 0.54, 0.26], sunIntensity: 90, sunSize: 0.0042, glow: 3.2, glowSpread: 18,
    smoke: 0.50, smokeColor: [1.55, 1.05, 0.70], smokeHeight: 0.17, stars: 0.0,
    lightColor: 0xffb072, lightIntensity: 4.2,
    hemiSky: 0x6d7f9c, hemiGround: 0x4a3a28, hemiIntensity: 0.85,
    envIntensity: 1.25,
    fog: { density: 0.0075, falloff: 22, max: 0.93,
      sky: [0.86, 0.56, 0.34], ground: [0.40, 0.30, 0.24], sunGain: 0.42,
      desat: 0.40, flatten: 0.10 },
    exposure: 0.60, godStrength: 0.45, bloom: 0.42, saturation: 0.98, contrast: 1.08,
  },
  // 3 月 24 日午后：日军攻北门，硝烟遮日
  smokyDay: {
    sunElevation: 38, sunAzimuth: 214,
    zenith: [1.90, 2.35, 3.20], horizon: [5.40, 5.20, 4.90], ground: [0.58, 0.52, 0.42],
    sunColor: [1.0, 0.92, 0.78], sunIntensity: 120, sunSize: 0.0030, glow: 1.35, glowSpread: 12,
    smoke: 0.72, smokeColor: [3.30, 3.10, 2.85], smokeHeight: 0.30, stars: 0.0,
    // 天地比：实测天 sRGB 234 / 地 136 只有 3.4:1 的线性亮度比，屋脊和人的轮廓
    // 从天上剥不出来。ER2 那种照片感是 6—8:1。修法必须是**降 lightIntensity**
    // 而不是降 exposure —— 降 exposure 天会跟着一起暗，比例白调。
    // 同时把半球光拉大（1.05 → 1.40）并把两端拉开：朝上的面吃冷天光、
    // 屋檐下与下巴吃暖地反光，「暖主光 + 冷阴影」才成立。
    lightColor: 0xffe6c4, lightIntensity: 3.1,
    hemiSky: 0x7796c8, hemiGround: 0x6f4c26, hemiIntensity: 1.40,
    // 真正压住地面亮度的是这一项，不是 lightIntensity。实测：平行光从 4.8 砍到 3.1，
    // 街景地面/墙面均值只从 sRGB 108 动到 107 —— 这几面墙全在背光侧，亮度几乎
    // 都来自 scene.environment 那张天空 IBL。1.20 → 0.95 才把均值压到 90—110、
    // 天仍留在 237，天地线性亮度比从 3.4:1 拉到 6:1 上下。
    // 别再往下砍：试过 0.75，地面掉到 74，暗部糊成一片。
    envIntensity: 0.95,
    fog: { density: 0.0125, falloff: 20, max: 0.94,
      sky: [0.72, 0.70, 0.66], ground: [0.38, 0.39, 0.42], sunGain: 0.24,
      desat: 0.50, flatten: 0.15 },
    exposure: 0.42, godStrength: 0.28, bloom: 0.34, saturation: 0.90, contrast: 1.07,
  },
  // 阴天：鲁南三四月多西南风、浮尘大，天是一块均匀的亮。
  // 这一档没有硬阴影，形体感全靠 AO 与环境光——最难做，也最能看出管线水平。
  overcast: {
    sunElevation: 42, sunAzimuth: 200,
    zenith: [1.55, 1.68, 1.95], horizon: [2.30, 2.32, 2.34], ground: [0.50, 0.46, 0.40],
    sunColor: [1.0, 0.98, 0.94], sunIntensity: 6, sunSize: 0.020, glow: 0.6, glowSpread: 4,
    smoke: 0.62, smokeColor: [2.05, 2.02, 1.96], smokeHeight: 0.42, stars: 0.0,
    lightColor: 0xf0f2f5, lightIntensity: 1.6,
    hemiSky: 0xb6bcc4, hemiGround: 0x585048, hemiIntensity: 1.6,
    envIntensity: 1.55,
    fog: { density: 0.0150, falloff: 18, max: 0.95,
      sky: [0.70, 0.71, 0.73], ground: [0.46, 0.44, 0.40], sunGain: 0.10,
      desat: 0.55, flatten: 0.18 },
    exposure: 0.88, godStrength: 0.0, bloom: 0.34, saturation: 0.86, contrast: 1.02,
  },
  // 3 月 27 日——4 月 2 日：城内巷战，一半的天被火烧着
  burningStreet: {
    sunElevation: 21, sunAzimuth: 238,
    zenith: [0.78, 0.92, 1.35], horizon: [3.90, 2.55, 1.45], ground: [0.50, 0.40, 0.30],
    sunColor: [1.0, 0.70, 0.38], sunIntensity: 88, sunSize: 0.0034, glow: 2.4, glowSpread: 13,
    smoke: 0.88, smokeColor: [1.85, 1.35, 1.00], smokeHeight: 0.36, stars: 0.0,
    lightColor: 0xffbb80, lightIntensity: 2.7,
    hemiSky: 0x6a7ba8, hemiGround: 0x63472e, hemiIntensity: 1.30,
    envIntensity: 0.95,
    fog: { density: 0.0165, falloff: 16, max: 0.95,
      sky: [0.74, 0.52, 0.36], ground: [0.42, 0.32, 0.26], sunGain: 0.38,
      desat: 0.45, flatten: 0.13 },
    exposure: 0.48, godStrength: 0.55, bloom: 0.50, saturation: 0.94, contrast: 1.10,
  },
  // 4 月 3 日夜：敢死队
  night: {
    sunElevation: 34, sunAzimuth: 96,
    zenith: [0.020, 0.030, 0.062], horizon: [0.075, 0.086, 0.125], ground: [0.026, 0.026, 0.032],
    sunColor: [0.52, 0.62, 0.92], sunIntensity: 2.4, sunSize: 0.010, glow: 0.22, glowSpread: 7,
    smoke: 0.55, smokeColor: [0.085, 0.095, 0.130], smokeHeight: 0.26, stars: 0.55,
    lightColor: 0x9fb4e8, lightIntensity: 0.42,
    hemiSky: 0x2b3a5c, hemiGround: 0x171310, hemiIntensity: 0.30,
    envIntensity: 1.40,
    fog: { density: 0.0210, falloff: 14, max: 0.96,
      sky: [0.055, 0.065, 0.095], ground: [0.030, 0.032, 0.040], sunGain: 0.04,
      desat: 0.35, flatten: 0.06 },
    exposure: 3.6, godStrength: 0.0, bloom: 0.85, saturation: 0.72, contrast: 1.14,
  },
  // 4 月 7 日拂晓：总反攻
  dawn: {
    sunElevation: 4.0, sunAzimuth: 88,
    zenith: [0.50, 0.72, 1.30], horizon: [4.60, 2.70, 1.45], ground: [0.48, 0.40, 0.32],
    sunColor: [1.0, 0.64, 0.36], sunIntensity: 105, sunSize: 0.0044, glow: 3.6, glowSpread: 15,
    smoke: 0.58, smokeColor: [1.80, 1.25, 0.90], smokeHeight: 0.21, stars: 0.04,
    lightColor: 0xffc890, lightIntensity: 3.0,
    hemiSky: 0x6b84b8, hemiGround: 0x50402f, hemiIntensity: 1.30,
    envIntensity: 1.05,
    fog: { density: 0.0090, falloff: 24, max: 0.93,
      sky: [0.92, 0.60, 0.40], ground: [0.42, 0.33, 0.27], sunGain: 0.45,
      desat: 0.42, flatten: 0.11 },
    exposure: 0.50, godStrength: 0.60, bloom: 0.46, saturation: 0.96, contrast: 1.09,
  },
};

function Vec3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

export function SunDirectionFrom(elevationDeg, azimuthDeg) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export class SkyDome {
  constructor(renderer, { radius = 4000 } = {}) {
    this.renderer = renderer;
    this.uniforms = {
      uSunDirection: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
      uZenith: { value: new THREE.Vector3(0.2, 0.3, 0.5) },
      uHorizon: { value: new THREE.Vector3(0.7, 0.6, 0.5) },
      uGround: { value: new THREE.Vector3(0.12, 0.1, 0.08) },
      uSunColor: { value: new THREE.Vector3(1, 0.9, 0.75) },
      uSunIntensity: { value: 50 },
      uSunSize: { value: 0.003 },
      uGlowStrength: { value: 0.5 },
      uGlowSpread: { value: 16 },
      uSmoke: { value: 0.6 },
      uSmokeColor: { value: new THREE.Vector3(0.45, 0.4, 0.36) },
      uSmokeHeight: { value: 0.25 },
      uStars: { value: 0 },
      uTime: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    // r165+ 起 scene.overrideMaterial 只放过 allowOverride === false 的材质。
    // 天空穹的顶点着色器把 z 顶到远平面，被覆盖材质换掉之后它会以真实的
    // 4000 米深度参与深度法线预通道 —— SSAO 与体积光的天空判据当场作废。
    // 所有"不该进预通道"的东西（天空、粒子、贴片、烟）都要关掉这个开关。
    this.material.allowOverride = false;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = "SkyDome";
    // 天空穹不参与 AO/法线预通道 —— 它没有法线可言，混进去只会把远景 AO 弄脏
    this.mesh.userData.skipNormalDepth = true;

    this.pmrem = renderer ? new THREE.PMREMGenerator(renderer) : null;
    if (this.pmrem) this.pmrem.compileEquirectangularShader();
    this.envTarget = null;
    this.presetName = null;
    this.preset = null;
    this.sunDirection = new THREE.Vector3(0, 1, 0);
  }

  /** 直接套用一个预设（不插值）。 */
  Apply(nameOrPreset) {
    const preset = typeof nameOrPreset === "string" ? SKY_PRESETS[nameOrPreset] : nameOrPreset;
    if (!preset) throw new Error(`未知天空预设：${nameOrPreset}`);
    this.presetName = typeof nameOrPreset === "string" ? nameOrPreset : "custom";
    this.preset = preset;
    const U = this.uniforms;
    this.sunDirection = SunDirectionFrom(preset.sunElevation, preset.sunAzimuth);
    U.uSunDirection.value.copy(this.sunDirection);
    U.uZenith.value.copy(Vec3(preset.zenith));
    U.uHorizon.value.copy(Vec3(preset.horizon));
    U.uGround.value.copy(Vec3(preset.ground));
    U.uSunColor.value.copy(Vec3(preset.sunColor));
    U.uSunIntensity.value = preset.sunIntensity;
    U.uSunSize.value = preset.sunSize;
    U.uGlowStrength.value = preset.glow;
    U.uGlowSpread.value = preset.glowSpread;
    U.uSmoke.value = preset.smoke;
    U.uSmokeColor.value.copy(Vec3(preset.smokeColor));
    U.uSmokeHeight.value = preset.smokeHeight;
    U.uStars.value = preset.stars;
    return preset;
  }

  /**
   * 把当前天空烘成环境贴图挂到场景上。
   * 贵（约 10—20ms），只在换关/换时段时调，**不许每帧调**。
   */
  BakeEnvironment(scene) {
    if (!this.pmrem) return null;
    const skyScene = new THREE.Scene();
    const dome = new THREE.Mesh(this.mesh.geometry, this.material);
    dome.frustumCulled = false;
    skyScene.add(dome);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(skyScene, 0.04);
    skyScene.remove(dome);
    if (scene) {
      scene.environment = this.envTarget.texture;
      scene.environmentIntensity = this.preset?.envIntensity ?? 1;
    }
    return this.envTarget.texture;
  }

  Update(elapsedSeconds) {
    this.uniforms.uTime.value = elapsedSeconds;
  }

  Dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
    if (this.envTarget) this.envTarget.dispose();
    if (this.pmrem) this.pmrem.dispose();
  }
}
