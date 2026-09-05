// 《血战台儿庄》灯光装置：太阳（含跟随式阴影框）、Global SH Probe、环境底色、特效点光池。
//
// 阴影是"3A 与网页 demo"的第一道分水岭。要点：
//  - 平行光的正交阴影框必须**跟着玩家走**并且尽量小：框开到 500 米，2048 的图
//    每个纹素 24cm，砖墙的影子就是一条锯齿。这里框只开 62 米。
//  - 框的移动必须**吸附到纹素网格**，否则玩家一走动，所有阴影边缘就在那儿爬行
//    （shadow shimmering），比锯齿更廉价。
//  - normalBias 比 bias 好使：斜面上的自阴影痤疮靠它，而不是靠把 bias 调大到
//    影子整个飘起来（peter-panning）。

import * as THREE from "three";
import { GLOBAL_SH_PROBE_COEFFICIENTS } from "./Data_GlobalShProbe.mjs";

const SHADOW_SIZE = { low: 1024, medium: 2048, high: 4096, ultra: 4096 };
const EFFECT_LIGHT_COUNT = { low: 2, medium: 4, high: 6, ultra: 6 };
const MAX_EXPLOSION_ENVELOPES = 12;

function Clamp01(value) { return Math.max(0, Math.min(1, value)); }

export class LightRig {
  constructor(scene, { quality = "high", shadowExtent = 62 } = {}) {
    this.scene = scene;
    this.shadowExtent = shadowExtent;
    this.quality = quality;

    this.sun = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sun.castShadow = quality !== "low";
    const mapSize = SHADOW_SIZE[quality] ?? 2048;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = quality === "low" ? 1 : 2.2;
    this.sun.shadow.blurSamples = 12;
    this.sun.target = new THREE.Object3D();
    scene.add(this.sun);
    scene.add(this.sun.target);

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
  }

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
    this.sun.castShadow = this.quality !== "low" && preset.lightIntensity > 0.35;
  }

  /**
   * 每帧把阴影框挪到玩家前方，并吸附到纹素网格。
   * @param {THREE.Vector3} focus 玩家位置
   * @param {THREE.Vector3} forward 视线朝向（水平分量）
   */
  UpdateShadowFrustum(focus, forward) {
    const extent = this.shadowExtent;
    // 阴影框中心往前推 1/4 框宽：玩家看得见的东西比背后多
    const ahead = new THREE.Vector3(forward.x, 0, forward.z);
    if (ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(extent * 0.22);
    else ahead.set(0, 0, 0);
    const center = focus.clone().add(ahead);

    const cam = this.sun.shadow.camera;
    cam.left = -extent; cam.right = extent;
    cam.top = extent; cam.bottom = -extent;

    // 纹素吸附：把中心投到光空间，量化到纹素，再投回来
    const mapSize = this.sun.shadow.mapSize.x;
    const texelWorld = (extent * 2) / mapSize;
    const lightDir = this.sunDirection;
    const up = Math.abs(lightDir.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, lightDir).normalize();
    const trueUp = new THREE.Vector3().crossVectors(lightDir, right).normalize();
    const px = Math.round(center.dot(right) / texelWorld) * texelWorld;
    const py = Math.round(center.dot(trueUp) / texelWorld) * texelWorld;
    const pz = center.dot(lightDir);
    const snapped = new THREE.Vector3()
      .addScaledVector(right, px)
      .addScaledVector(trueUp, py)
      .addScaledVector(lightDir, pz);

    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(lightDir, 130);
    this.sun.target.updateMatrixWorld();
    cam.updateProjectionMatrix();
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
    this.scene.remove(this.sun, this.sun.target, this.globalProbe, this.ambient, this.muzzle);
    for (const l of this.fireLights) this.scene.remove(l);
    this.fireSources.clear();
    this.explosionEnvelopes.length = 0;
  }
}
