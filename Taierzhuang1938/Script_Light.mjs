// 《台儿庄：血战滕县》灯光装置：太阳（**级联阴影**）、Global SH Probe、环境底色、特效点光池。
//
// 阴影是"3A 与网页 demo"的第一道分水岭。要点：
//  - 2026-09 起太阳阴影是**级联**（CSM）：N 盏同方向 DirectionalLight 各持一张图，
//    近级小而密、远级大而疏。实现与着色器在 `Script_Csm.mjs`，数值在
//    `Data_Tuning_Shadows.mjs`；这里只负责装配与外部接口。
//    在此之前是**一张** 66 m 跟随框（4096 铺 132 m = 3.2 cm/texel，框外没有阴影）。
//  - 框的移动必须**吸附到纹素网格**，否则玩家一走动，所有阴影边缘就在那儿爬行
//    （shadow shimmering），比锯齿更廉价。级联版逐级吸附。
//  - normalBias 比 bias 好使：斜面上的自阴影痤疮靠它，而不是靠把 bias 调大到
//    影子整个飘起来（peter-panning）。级联版把面板给的基准值按逐级纹素尺度缩放。

import * as THREE from "three";
import { GLOBAL_SH_PROBE_COEFFICIENTS } from "./Data_GlobalShProbe.mjs";
import {
  CsmRig, ApplyRendererShadowSettings, SUN_SHADOW_SAMPLER_GLSL, MakeSunShadowUniforms,
} from "./Script_Csm.mjs";

const EFFECT_LIGHT_COUNT = { low: 2, medium: 4, high: 6, ultra: 6 };
const MAX_EXPLOSION_ENVELOPES = 12;

function Clamp01(value) { return Math.max(0, Math.min(1, value)); }

// ---------------------------------------------------------------------------
// 太阳阴影的**公共采样接口**（2026-09 帧图重构新增，同月升级为级联版）
//
// 谁要用：体积雾（光柱被墙切断）、屏幕空间接触阴影、簇状多光源、任何要在自己的
// pass 里问「这一点晒不晒得到太阳」的着色器。做法：
//
//   import { SUN_SHADOW_GLSL, BindSunShadowUniforms } from "./Script_Light.mjs";
//   const uniforms = { ...自己的 };
//   BindSunShadowUniforms(uniforms, lightRig);      // 建条目 + 接上当前阴影图
//   const frag = `...${SUN_SHADOW_GLSL}... void main(){ float v = SunShadowVisibility(wp, wn); }`;
//   // 每帧（或每次换靶）调一次 lightRig.SyncShadowUniforms()
//
// GLSL 侧三个签名：
//   `float SunShadowVisibility(vec3 worldPos, vec3 worldNormal)`  8 抽样 Vogel 盘
//   `float SunShadowVisibilityCheap(vec3 worldPos)`               单抽样（体积雾用）
//   `float SunShadowPenumbraTexels(vec3 worldPos, vec3 worldNormal)` 半影宽度（调试）
//
// **接口在 2026-09 换成级联时签名一个字没改**，调用方（Debug Rendering 的
// SunShadow 视图、接触阴影、体积雾）无需跟着改。所以：别在自己的 pass 里直接采
// `sun.shadow.map`，也别自己写一遍矩阵与 bias —— 那样再换一次实现要改八个文件。
//
// 两条硬要求（漏一条整趟全黑）：
//   · 采样器类型必须与 `Script_Csm.SHADOW_MAP_TYPE` 一致。`PCFShadowMap` 下
//     `depthTexture.compareFunction = LessEqualCompare`，它是**shadow 采样器纹理**，
//     用 `sampler2D` 绑定是未定义行为（多数驱动返回 0 = 全屏死黑）。本仓现在走
//     `BasicShadowMap`（裸深度，PCSS 要读深度值），GLSL 由 Script_Csm 按它生成。
//   · normal offset 在世界空间做（把着色点沿法线推出去），不是把 bias 调大 ——
//     后者是 peter-panning。
// ---------------------------------------------------------------------------
export const SUN_SHADOW_GLSL = SUN_SHADOW_SAMPLER_GLSL;

/**
 * 在一份 uniforms 上建齐 `SUN_SHADOW_GLSL` 要的条目，并接上当前的级联阴影图。
 * `lightRig` 传 null 也合法（建条目、置 `uSunShadowEnabled = 0`），
 * 之后再调 `lightRig.SyncShadowUniforms()` 补上。
 * @returns {object} 同一份 uniforms（方便链式）
 */
export function BindSunShadowUniforms(uniforms, lightRig = null) {
  MakeSunShadowUniforms(uniforms);
  if (lightRig) {
    lightRig.RegisterShadowUniforms(uniforms);
    lightRig.SyncShadowUniforms();
  }
  return uniforms;
}

export class LightRig {
  /**
   * @param {THREE.Scene} scene
   * @param {object} options
   * @param {string} options.quality low | medium | high | ultra
   * @param {number} options.shadowExtent 兼容参数：**级联版不再用它**（级数与半径
   *   由 `Data_Tuning_Shadows` 按 practical split 算）。保留是为了旧调用点不报错。
   * @param {THREE.WebGLRenderer} options.renderer 传了就由本装置把渲染器切到
   *   级联要的阴影口径（`BasicShadowMap` + `autoUpdate = false`）。**强烈建议传** ——
   *   采样器类型必须与 `Script_Csm.SHADOW_MAP_TYPE` 一致，不一致是未定义行为。
   */
  constructor(scene, { quality = "high", shadowExtent = 62, renderer = null } = {}) {
    this.scene = scene;
    this.shadowExtent = shadowExtent;
    this.quality = quality;
    if (renderer) ApplyRendererShadowSettings(renderer);

    // 级联阴影。`csm.lights[0]` 就是 `this.sun`：外部（Script_Gi 取太阳色、
    // 画质面板读 mapSize、ApplyGraphics 写 bias）拿的都是它，那些引用不许断。
    this.csm = new CsmRig(scene, { quality });
    this.sun = this.csm.sun;
    this.defaultShadowSize = this.csm.defaultMapSize;
    // 重构前 low 档**完全没有**太阳阴影（castShadow = false，靠雾盖）。级联之后
    // low 是 2 级 × 1024、只铺 70 m、第二级三帧一烘 —— 比原来的「一张 1024 铺
    // 132 m」还便宜，所以这一档也给上阴影。总闸（画质面板「阴影」）照常管得着。
    this.csm.SetCastShadow(true);

    // 默认间接光基线：下载的通用 HDR 积分出的全局 L2 SH + 一盏很弱的环境底色。
    // 与旧的实时探针体不同，它不跑 ray-trace pass，也不依赖 scene.environment；
    // SH 保留「天比地亮」的方向性，AmbientLight 只托住阴影最深处的材质信息。
    this.globalProbe = new THREE.LightProbe();
    this.globalProbe.sh.fromArray(GLOBAL_SH_PROBE_COEFFICIENTS);
    this.globalProbe.intensity = 0.34;
    scene.add(this.globalProbe);
    this.ambient = new THREE.AmbientLight(0x607085, 0.16);
    scene.add(this.ambient);
    this.probeBase = this.globalProbe.intensity;
    this.ambientBase = this.ambient.intensity;
    this.giFill = 1;

    // 持续火焰与爆炸共用一组固定预算的物理 PointLight。逻辑源可以多于灯槽；每帧按
    // 镜头处贡献排序，只把最有用的几盏送进 three 的前向 PBR pass。这样炮击齐射不会
    // 无上限加 NUM_POINT_LIGHTS，也不会为了“有灯/没灯”反复重编译整座城的材质。
    //
    // 灯从出生到销毁都保持 visible=true，闲置只把 intensity 归零。three 会把 visible
    // 点光数量编进 shader；切 visible 会让第一颗手榴弹那一帧刚好撞上 shader 重编译。
    this.fireLights = [];
    const effectLightCount = EFFECT_LIGHT_COUNT[quality] ?? EFFECT_LIGHT_COUNT.high;
    for (let i = 0; i < effectLightCount; i += 1) {
      const light = new THREE.PointLight(0xff7a2a, 0, 24, 2);
      light.name = `VfxPointLight${i + 1}`;
      light.castShadow = false;
      light.visible = true;
      scene.add(light);
      this.fireLights.push(light);
    }
    this.fireSources = new Map();
    this.nextFireHandle = 1;
    this.explosionEnvelopes = [];
    this.nextExplosionId = 1;
    this.effectFocus = new THREE.Vector3();
    this.hasEffectFocus = false;

    // 枪口闪光：一盏，抢用。开火那一帧亮 2 帧就灭 —— 长亮就成手电筒了。
    this.muzzle = new THREE.PointLight(0xffd9a0, 0, 22, 2);
    this.muzzle.name = "VfxMuzzleLight";
    this.muzzle.visible = true;
    this.muzzle.castShadow = false;
    scene.add(this.muzzle);
    this.muzzleAge = 1;
    this.muzzleDuration = 0.055;
    this.muzzleBase = 0;

    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this.viewCamera = null;
    // 登记过的「太阳阴影采样」uniform 包（见 SUN_SHADOW_GLSL）。用 Set 不用数组：
    // 同一个 pass 重复登记是幂等的。
    this.shadowUniformClients = new Set();
  }

  /**
   * 画质面板那几根：深度偏移 / 法线偏移 / 阴影强度 / 阴影图尺寸。
   * 面板给的是**第 0 级的基准**，往外逐级按纹素尺度缩放（见 CsmRig._ApplyBias）。
   * @param {object} options
   * @param {number} [options.bias] 归一化深度偏移（在参考深度范围上）
   * @param {number} [options.normalBias] 世界米
   * @param {number} [options.intensity] 1 = 影子全黑；< 1 = 影子不死黑
   * @param {number} [options.mapSize] 每级图边长；0 / 缺省 = 用档位默认
   */
  SetShadowTuning({ bias, normalBias, intensity, mapSize } = {}) {
    if (Number.isFinite(intensity)) this.csm.SetIntensity(intensity);
    this.csm.SetBias(bias, normalBias);
    if (Number.isFinite(mapSize)) this.csm.SetMapSize(mapSize || this.csm.defaultMapSize);
  }

  /**
   * 阴影总距离（米）= 最远一级铺到哪。面板那根「阴影距离」。
   * 分割按 practical split 在 [splitNear, min(camera.far, 这个数)] 上重算。
   */
  SetShadowDistance(meters) {
    this.csm.SetMaxDistance(meters);
  }

  /** 让一份 uniforms 跟着本 rig 的阴影图走。一般由 `BindSunShadowUniforms` 代调。 */
  RegisterShadowUniforms(uniforms) {
    if (uniforms) this.shadowUniformClients.add(uniforms);
    return uniforms;
  }

  UnregisterShadowUniforms(uniforms) {
    this.shadowUniformClients.delete(uniforms);
  }

  /**
   * 每帧（或换靶/换画质档后）调一次：把**全部级联**的图、矩阵与参数推给所有
   * 登记过的 pass。
   *
   * **必须排在本帧阴影图烘完之后** —— `shadow.map` 是 three 在第一次
   * `shadowMap.render` 时才建的，boot 那几帧是 null。矩阵每帧都在动
   * （逐级跟着相机滚并吸附纹素），所以不能只接一次。
   */
  SyncShadowUniforms() {
    if (!this.shadowUniformClients.size) return;
    for (const uniforms of this.shadowUniformClients) this.csm.SyncUniforms(uniforms);
  }

  /**
   * 点这一帧要烘哪几级阴影图。**替代旧的那句全局
   * `renderer.shadowMap.needsUpdate = true`**（见 Script_Main.RenderScene）。
   * @returns {number} 这一帧真的要烘的级数
   */
  ScheduleShadowUpdate(renderer) {
    return this.csm.ScheduleShadowUpdate(renderer);
  }

  /** 镜头硬切 / 换关 / 传送：下一帧全级重拟合重烘。 */
  NotifyCameraCut() { this.csm.ForceUpdate(); }

  /** 级联取证（逐级半径、纹素、分割、bias、这一帧烘了几张）。测试与面板读它。 */
  GetShadowState() { return this.csm.GetState(); }

  /**
   * Global SH 基线与探针体的分工。
   *
   * 全局 SH 是默认、无位置感的室外天光；实时探针体打开后会算得更准（尤其是
   * 头顶有没有屋顶）。两者全量叠加会双份补光，所以 GI 收敛后把全局基线压低，
   * 仍留一点给探针体外的远景和图集刚重置的几帧兜底。
   */
  SetGiActive(active) {
    this.giFill = active ? 0.42 : 1;
    this.globalProbe.intensity = this.probeBase * this.giFill;
    this.ambient.intensity = this.ambientBase * (active ? 0.72 : 1);
  }

  /** 套用 SKY_PRESETS 里那一份光照参数。 */
  ApplyPreset(preset, sunDirection) {
    this.sun.color.setHex(preset.lightColor);
    this.sun.intensity = preset.lightIntensity;
    // 全局 Probe 本身固定来源于通用 HDR；只按时段缩放，避免夜战仍吃正午亮度。
    this.probeBase = preset.shProbeIntensity ?? (preset.lightIntensity <= 0.5 ? 0.11 : 0.34);
    this.ambient.color.setHex(preset.ambientColor ?? 0x607085);
    this.ambientBase = preset.ambientIntensity ?? (preset.lightIntensity <= 0.5 ? 0.045 : 0.16);
    this.globalProbe.intensity = this.probeBase * this.giFill;
    this.ambient.intensity = this.ambientBase * (this.giFill < 1 ? 0.72 : 1);
    this.sunDirection.copy(sunDirection).normalize();
    // 夜战（lightIntensity ≤ 0.35）关掉阴影：那一档太阳本来就几乎不照，
    // 烘四张图纯属白花。low 档不再一刀切关掉（见构造器里的账）。
    this.csm.SetCastShadow(preset.lightIntensity > 0.35);
    // 太阳换方向 = 所有级的图全废，下一帧整体重烘（CsmRig 自己也会按点积判，
    // 这里显式点一下是为了换关那一帧不落后）。
    this.csm.ForceUpdate();
  }

  /**
   * 每帧把级联框拟合到相机视锥并吸附纹素网格。
   *
   * **只重拟合这一帧要重烘的级**（逐级节流在 CsmRig 里）—— 否则会出现
   * 「矩阵是新的、图是旧的」，影子整体平移半个身位而且只在移动时出现。
   *
   * @param {THREE.Vector3} focus 玩家/相机位置（没接相机时的退路）
   * @param {THREE.Vector3} forward 视线朝向
   * @param {THREE.PerspectiveCamera} camera 主视图相机（拿 fov / aspect / far / 位姿）
   */
  UpdateShadowFrustum(focus, forward, camera = null) {
    this.csm.Update(camera || this.viewCamera || null, this.sunDirection, focus, forward);
  }

  /**
   * 接一台主视图相机。接上之后 `UpdateShadowFrustum` 就按真实视锥切片拟合级联
   * （包围球半径只依赖 fov/aspect/分割距离，不依赖相机位姿 —— 转头不沸腾）。
   * 不接也能跑，只是退回一套固定的 fov/aspect 估计。
   */
  SetViewCamera(camera) {
    this.viewCamera = camera || null;
    // 开镜会把 fov 从 55 压到 20，级联半径跟着缩三分之一 = 阴影边缘随开镜呼吸。
    // 拟合一律用基准 FOV。
    if (camera) camera.userData.csmBaseFov = camera.userData.csmBaseFov ?? camera.fov;
    this.csm.ForceUpdate();
  }

  /**
   * 点一处火：返回逻辑句柄，可以再关掉。位置固定的火（着火的房子、燃烧的战车）。
   *
   * `flicker: false` 是给**自带包络的光源**开的口子（照明弹走这一条）：
   * 这里那两条正弦是「火在烧」的抖动，套在一枚照明弹的升空—点燃—衰减曲线上
   * 就成了双份抖动，而且调用方给的强度永远兑现不了（它还要被乘一次 flicker）。
   * 关掉之后 `currentIntensity` 就等于调用方写进来的那个数，逐帧由 `UpdateFire` 改。
   *
   * `priority` 让照明弹在灯槽紧张时压过远处常驻的火：它是这一关唯一的主光源。
   */
  AddFire(position, {
    intensity = 6, radius = 20, color = 0xff7a2a, flicker = true, priority = 1,
  } = {}) {
    const handle = this.nextFireHandle;
    this.nextFireHandle += 1;
    this.fireSources.set(handle, {
      handle,
      position: new THREE.Vector3(position.x, position.y, position.z),
      color: new THREE.Color(color),
      base: Math.max(0, Number(intensity) || 0),
      radius: Math.max(1, Number(radius) || 20),
      seed: handle * 37.13,
      flicker: flicker !== false,
      currentIntensity: 0,
      score: 0,
      priority: Math.max(0, Number(priority) || 1),
    });
    return handle;
  }

  /**
   * 改一盏已有的火光：位置 / 强度 / 半径 / 颜色，四样都是可选的。
   * 会动的光源（照明弹伞降、火把、提灯）用它逐帧写，**不要拆了重建** ——
   * 每帧 Remove+Add 会让 `seed`（抖动相位）与灯槽排序每帧重掷。
   * @returns {boolean} 这个句柄还在不在
   */
  UpdateFire(handle, { position = null, intensity = null, radius = null, color = null } = {}) {
    const state = this.fireSources.get(handle);
    if (!state) return false;
    if (position) state.position.set(position.x, position.y, position.z);
    if (intensity != null) state.base = Math.max(0, Number(intensity) || 0);
    if (radius != null) state.radius = Math.max(1, Number(radius) || state.radius);
    if (color != null) state.color.setHex(color);
    return true;
  }

  RemoveFire(handle) {
    this.fireSources.delete(handle);
  }

  ClearFires() {
    this.fireSources.clear();
  }

  /**
   * 爆炸的白热核 → 橙红火球光包络。粒子负责看见火球，这里负责把同一拍亮度泼到
   * 地面、墙面、人物和瓦砾上。多发爆炸各自保留包络，再由固定灯池挑最重要的几盏。
   */
  FlashExplosion(position, {
    intensity = 64, radius = 24, duration = 0.62,
    coreColor = 0xfff1d2, fireColor = 0xff7626,
  } = {}) {
    if (this.explosionEnvelopes.length >= MAX_EXPLOSION_ENVELOPES) {
      // 炮击极端密集时丢掉最老的光包络；粒子和伤害照常，灯的 GPU 预算不膨胀。
      this.explosionEnvelopes.sort((a, b) => (b.age / b.duration) - (a.age / a.duration));
      this.explosionEnvelopes.shift();
    }
    const envelope = {
      id: this.nextExplosionId,
      position: new THREE.Vector3(position.x, position.y, position.z),
      coreColor: new THREE.Color(coreColor),
      fireColor: new THREE.Color(fireColor),
      currentColor: new THREE.Color(coreColor),
      base: Math.max(0, Number(intensity) || 0),
      radius: Math.max(1, Number(radius) || 24),
      duration: Math.max(0.08, Number(duration) || 0.62),
      age: 0,
      currentIntensity: Math.max(0, Number(intensity) || 0),
      currentRadius: Math.max(1, Number(radius) || 24) * 0.55,
      score: 0,
      priority: 1.35,
    };
    this.nextExplosionId += 1;
    this.explosionEnvelopes.push(envelope);
    return envelope.id;
  }

  /** 开火：闪一下。position 用枪口世界坐标。 */
  FlashMuzzle(position, intensity = 26, { duration = 0.055, color = 0xffd9a0 } = {}) {
    this.muzzle.position.copy(position);
    this.muzzle.color.setHex(color);
    this.muzzleBase = Math.max(0, Number(intensity) || 0);
    this.muzzle.intensity = this.muzzleBase;
    this.muzzleDuration = Math.max(0.025, Number(duration) || 0.055);
    this.muzzleAge = 0;
  }

  _ScoreEffect(state, radius, focus) {
    if (!focus) return state.currentIntensity * state.priority;
    const dx = state.position.x - focus.x;
    const dy = state.position.y - focus.y;
    const dz = state.position.z - focus.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // 灯圈内不降权；灯圈外按距离平方降权。爆炸的 priority 只负责在近似同贡献时
    // 抢过远处常驻火，不会让镜头背后的炮火挤掉眼前正在烧的房子。
    const outside = Math.max(0, distance - radius) / Math.max(1, radius);
    return state.currentIntensity * state.priority / (1 + outside * outside);
  }

  Update(dt, elapsed, focus = null) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    if (focus) {
      this.effectFocus.copy(focus);
      this.hasEffectFocus = true;
    }
    const scoringFocus = this.hasEffectFocus ? this.effectFocus : null;
    const candidates = [];

    // 火焰闪烁：两个不同频率的正弦叠一点噪声。单频率会看出规律的"呼吸"。
    // `flicker:false` 的光源自带包络（照明弹），这里原样兑现它写进来的强度。
    for (const state of this.fireSources.values()) {
      if (state.flicker === false) {
        state.currentIntensity = state.base;
      } else {
        const t = elapsed * 1.0 + state.seed;
        const flicker = 0.72
          + 0.18 * Math.sin(t * 7.3)
          + 0.10 * Math.sin(t * 17.9 + 1.7)
          + 0.08 * Math.sin(t * 31.1 + 3.1);
        state.currentIntensity = state.base * Math.max(0.28, flicker);
      }
      state.currentRadius = state.radius;
      state.score = this._ScoreEffect(state, state.currentRadius, scoringFocus);
      candidates.push(state);
    }

    for (let i = this.explosionEnvelopes.length - 1; i >= 0; i -= 1) {
      const state = this.explosionEnvelopes[i];
      state.age += step;
      const t = Clamp01(state.age / state.duration);
      if (t >= 1) {
        this.explosionEnvelopes.splice(i, 1);
        continue;
      }
      // 极短的白热峰 + 稍长的火球余辉。两项都按秒算，30/60/120 fps 下同一时刻同亮度。
      const flash = 0.62 * Math.exp(-8 * t);
      const fire = 0.38 * (1 - t) * (1 - t);
      state.currentIntensity = state.base * (flash + fire);
      state.currentRadius = state.radius * (0.55 + 0.45 * Clamp01(t / 0.22));
      const warm = 1 - Math.exp(-12 * t);
      state.currentColor.copy(state.coreColor).lerp(state.fireColor, warm);
      state.score = this._ScoreEffect(state, state.currentRadius, scoringFocus);
      candidates.push(state);
    }

    candidates.sort((a, b) => b.score - a.score
      || (a.handle ?? a.id ?? 0) - (b.handle ?? b.id ?? 0));
    for (let i = 0; i < this.fireLights.length; i += 1) {
      const light = this.fireLights[i];
      const state = candidates[i];
      if (!state) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(state.position);
      light.color.copy(state.currentColor || state.color);
      light.distance = state.currentRadius;
      light.intensity = state.currentIntensity;
    }

    if (this.muzzleAge < this.muzzleDuration) {
      this.muzzleAge += step;
      const t = Clamp01(this.muzzleAge / this.muzzleDuration);
      this.muzzle.intensity = this.muzzleBase * (1 - t) * (1 - t);
    } else {
      this.muzzle.intensity = 0;
    }
  }

  /** 浏览器测试与渲染调试面板取证，不参与玩法。 */
  GetEffectLightState() {
    return {
      budget: this.fireLights.length,
      persistent: this.fireSources.size,
      explosions: this.explosionEnvelopes.length,
      active: this.fireLights.filter((light) => light.intensity > 0).map((light) => ({
        color: light.color.getHex(), intensity: light.intensity, radius: light.distance,
        position: light.position.toArray(),
      })),
      muzzle: this.muzzle.intensity,
    };
  }

  Dispose() {
    this.csm.Dispose();
    this.scene.remove(this.globalProbe, this.ambient, this.muzzle);
    for (const l of this.fireLights) this.scene.remove(l);
    this.fireSources.clear();
    this.explosionEnvelopes.length = 0;
  }
}
