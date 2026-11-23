// 特效预览窗口的灯：只实现特效系统要的那一小块灯光接口，不是游戏的灯光装置。
//
// 特效（Script_Vfx、照明弹、燃烧源）与灯打交道只经这几样：
//   AddFire / UpdateFire / RemoveFire、FlashExplosion、FlashMuzzle、fireSources、sunDirection、flareSceneScale，
//   以及照明弹视觉读的 sun / ambient / globalProbe；预览编辑器另用 Begin/Reset/EndEffectPreview + Update。
// 这里用 three 自带的平行光 + 全局 SH 探针 + 环境底色 + 固定数量的点光实现它们 ——
// 与游戏 low 档同一种光照模型，但没有级联阴影、簇光、GI。亮度包络与游戏共用
// Script_EffectLightEnvelope，火怎么抖、爆炸光多久灭只有一份定义。
// 主光、天光、底色与照明弹昼夜口径全部来自环境预设（Script_VfxPreviewEnvironment），这里不写死任何时段。

import * as THREE from "three";
import { GLOBAL_SH_PROBE_COEFFICIENTS } from "../Data_GlobalShProbe.mjs";
import { EFFECT_LIGHT_COUNT } from "../Data_Tuning_Lights.mjs";
import { FireFlicker, ExplosionEnvelope, MuzzleEnvelope } from "../Script_EffectLightEnvelope.mjs";

const MAX_EXPLOSION_ENVELOPES = 12;

export class PreviewLights {
  constructor(scene, { quality = "high", shadowMapSize = 2048 } = {}) {
    this.scene = scene;
    this.sunDirection = new THREE.Vector3(0, 1, 0);
    this.flareSceneScale = 1;

    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.name = "PreviewSun";
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const box = this.sun.shadow.camera;
    box.left = -40; box.right = 40; box.top = 40; box.bottom = -40; box.near = 1; box.far = 400;
    scene.add(this.sun, this.sun.target);

    this.globalProbe = new THREE.LightProbe();
    this.globalProbe.sh.fromArray(GLOBAL_SH_PROBE_COEFFICIENTS);
    this.globalProbe.intensity = 0;
    scene.add(this.globalProbe);
    this.ambient = new THREE.AmbientLight(0x607085, 0);
    scene.add(this.ambient);

    // 点光池：灯常亮（visible 恒 true，闲置只把强度归零），数量固定 —— 灯数编进着色器，翻 visible 会重编译。
    this.fireLights = [];
    const count = EFFECT_LIGHT_COUNT[quality] ?? EFFECT_LIGHT_COUNT.high;
    for (let i = 0; i < count; i += 1) {
      const light = new THREE.PointLight(0xff7a2a, 0, 24, 2);
      light.name = `PreviewEffectLight${i + 1}`;
      scene.add(light);
      this.fireLights.push(light);
    }
    // 一盏带立方体阴影的点光：给得分最高的那一处光源（照明弹优先），看墙后、檐下的投影。
    // 没有有效光源时关 shadow.autoUpdate（不翻 castShadow，避免触发着色器重编译，同时省掉 6 面空烘）。
    const cubeSize = quality === "low" ? 512 : 1024;
    this.shadowLight = new THREE.PointLight(0xffffff, 0, 60, 2);
    this.shadowLight.name = "PreviewShadowLight";
    this.shadowLight.castShadow = true;
    this.shadowLight.shadow.autoUpdate = false;
    this.shadowLight.shadow.mapSize.set(cubeSize, cubeSize);
    this.shadowLight.shadow.bias = -0.002;
    scene.add(this.shadowLight);
    this.muzzle = new THREE.PointLight(0xffd9a0, 0, 22, 2);
    this.muzzle.name = "PreviewMuzzleLight";
    scene.add(this.muzzle);

    this.fireSources = new Map();
    this.explosionEnvelopes = [];
    this.nextFireHandle = 1;
    this.nextExplosionId = 1;
    this.muzzleAge = 1; this.muzzleDuration = 0.055; this.muzzleBase = 0;
    this.focus = new THREE.Vector3();
  }

  // --- 环境（由环境预设求值后交进来）-------------------------------------------------------

  /**
   * @param {object} env  环境组件拼出的环境参数（lightColor / lightIntensity / shProbeIntensity /
   *                      ambientColor / ambientIntensity …，与 SKY_PRESETS 同形）
   * @param {THREE.Vector3} sunDirection 指向太阳的单位向量
   * @param {number} flareSceneScale 照明弹昼夜口径
   */
  ApplyEnvironment(env, sunDirection, flareSceneScale = 1) {
    this.sunDirection.copy(sunDirection).normalize();
    this.sun.color.setHex(env.lightColor ?? 0xffffff);
    this.sun.intensity = env.lightIntensity ?? 1;
    // 与游戏同一条规矩：主光很弱（夜）时不烘阴影图。
    this.sun.castShadow = this.sun.intensity > 0.35;
    this.globalProbe.intensity = env.shProbeIntensity ?? (this.sun.intensity <= 0.5 ? 0.11 : 0.34);
    this.ambient.color.setHex(env.ambientColor ?? 0x607085);
    this.ambient.intensity = env.ambientIntensity ?? (this.sun.intensity <= 0.5 ? 0.045 : 0.16);
    this.flareSceneScale = flareSceneScale;
  }

  /** 平行光的阴影框跟着镜头注视点走（预览场地小，一张图够用）。 */
  FollowView(target, extent = 40) {
    const box = this.sun.shadow.camera;
    if (box.right !== extent) {
      box.left = -extent; box.right = extent; box.top = extent; box.bottom = -extent;
      box.updateProjectionMatrix();
    }
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDirection, 200);
    this.sun.target.updateMatrixWorld();
  }

  // --- 太阳阴影采样接口（血迹贴花等着色器登记用）------------------------------------------
  // 预览台没有级联阴影图：登记进来的 uniform 包保持「不采阴影」（uSunShadowEnabled = 0），贴花按全亮着色。
  RegisterShadowUniforms(uniforms) {
    if (uniforms?.uSunShadowEnabled) uniforms.uSunShadowEnabled.value = 0;
  }

  SyncShadowUniforms() {}

  // --- 特效光接口（Script_Vfx / Script_Flare 调用）-------------------------------------------

  AddFire(position, {
    intensity = 6, radius = 20, color = 0xff7a2a, flicker = true, priority = 1, flareShadow = false, autoSmoke = true,
  } = {}) {
    const handle = this.nextFireHandle;
    this.nextFireHandle += 1;
    this.fireSources.set(handle, {
      handle, flareShadow: !!flareShadow, autoSmoke: autoSmoke !== false,
      position: new THREE.Vector3(position.x, position.y, position.z),
      color: new THREE.Color(color),
      base: Math.max(0, Number(intensity) || 0),
      radius: Math.max(1, Number(radius) || 20),
      seed: handle * 37.13,
      flicker: flicker !== false,
      currentIntensity: 0, currentRadius: Math.max(1, Number(radius) || 20), score: 0,
      priority: Math.max(0, Number(priority) || 1),
    });
    return handle;
  }

  UpdateFire(handle, { position = null, intensity = null, radius = null, color = null, emission = undefined,
    temporalFlutter = undefined, temporalTime = undefined, emitterVisible = undefined, opticalEmitter = undefined } = {}) {
    const state = this.fireSources.get(handle);
    if (!state) return false;
    if (position) state.position.set(position.x, position.y, position.z);
    if (intensity != null) state.base = Math.max(0, Number(intensity) || 0);
    if (radius != null) state.radius = Math.max(1, Number(radius) || state.radius);
    if (color != null) state.color.setHex(color);
    if (emission !== undefined) state.emission = emission;
    if (temporalFlutter !== undefined) state.temporalFlutter = temporalFlutter;
    if (temporalTime !== undefined) state.temporalTime = temporalTime;
    if (emitterVisible !== undefined) state.emitterVisible = emitterVisible;
    if (opticalEmitter !== undefined) state.opticalEmitter = opticalEmitter;
    return true;
  }

  RemoveFire(handle) { this.fireSources.delete(handle); }
  ClearFires() { this.fireSources.clear(); }

  FlashExplosion(position, { intensity = 64, radius = 24, duration = 0.62, coreColor = 0xfff1d2, fireColor = 0xff7626 } = {}) {
    if (this.explosionEnvelopes.length >= MAX_EXPLOSION_ENVELOPES) this.explosionEnvelopes.shift();
    const base = Math.max(0, Number(intensity) || 0);
    const envelope = {
      id: this.nextExplosionId,
      position: new THREE.Vector3(position.x, position.y, position.z),
      coreColor: new THREE.Color(coreColor), fireColor: new THREE.Color(fireColor), currentColor: new THREE.Color(coreColor),
      base, radius: Math.max(1, Number(radius) || 24), duration: Math.max(0.08, Number(duration) || 0.62),
      age: 0, currentIntensity: base, currentRadius: Math.max(1, Number(radius) || 24) * 0.55, score: 0, priority: 1.35,
    };
    this.nextExplosionId += 1;
    this.explosionEnvelopes.push(envelope);
    return envelope.id;
  }

  FlashMuzzle(position, intensity = 26, { duration = 0.055, color = 0xffd9a0, radius = 22 } = {}) {
    this.muzzle.distance = radius;
    this.muzzle.position.copy(position);
    this.muzzle.color.setHex(color);
    this.muzzleBase = Math.max(0, Number(intensity) || 0);
    this.muzzle.intensity = this.muzzleBase;
    this.muzzleDuration = Math.max(0.025, Number(duration) || 0.055);
    this.muzzleAge = 0;
  }

  // --- 预览编辑器的时钟（同 LightRig 的同名接口）---------------------------------------------

  BeginEffectPreview() { this.ResetEffectPreview(); return { preview: true }; }

  ResetEffectPreview() {
    this.fireSources.clear();
    this.explosionEnvelopes.length = 0;
    this.nextFireHandle = 1; this.nextExplosionId = 1;
    this.muzzleAge = 1; this.muzzleBase = 0; this.muzzle.intensity = 0;
    this.Update(0, 0);
  }

  EndEffectPreview() { this.ResetEffectPreview(); }

  Score(state, radius) {
    const distance = state.position.distanceTo(this.focus);
    const outside = Math.max(0, distance - radius) / Math.max(1, radius);
    return state.currentIntensity * state.priority / (1 + outside * outside);
  }

  Update(dt, elapsed, focus = null) {
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    if (focus) this.focus.copy(focus);
    const candidates = [];
    for (const state of this.fireSources.values()) {
      state.currentIntensity = state.flicker === false ? state.base : state.base * FireFlicker(elapsed, state.seed);
      state.currentRadius = state.radius;
      state.score = this.Score(state, state.currentRadius);
      candidates.push(state);
    }
    for (let i = this.explosionEnvelopes.length - 1; i >= 0; i -= 1) {
      const state = this.explosionEnvelopes[i];
      state.age += step;
      const envelope = ExplosionEnvelope(state.age, state.duration);
      if (envelope.done) { this.explosionEnvelopes.splice(i, 1); continue; }
      state.currentIntensity = state.base * envelope.intensity;
      state.currentRadius = state.radius * envelope.radius;
      state.currentColor.copy(state.coreColor).lerp(state.fireColor, envelope.warm);
      state.score = this.Score(state, state.currentRadius);
      candidates.push(state);
    }
    candidates.sort((a, b) => (b.flareShadow - a.flareShadow) || (b.score - a.score) || ((a.handle ?? a.id) - (b.handle ?? b.id)));
    const Assign = (light, state) => {
      if (!state || state.currentIntensity <= 0) { light.intensity = 0; return; }
      light.position.copy(state.position);
      light.color.copy(state.currentColor || state.color);
      light.distance = state.currentRadius;
      light.intensity = state.currentIntensity;
    };
    Assign(this.shadowLight, candidates[0]);
    this.shadowLight.shadow.autoUpdate = this.shadowLight.intensity > 0;
    for (let i = 0; i < this.fireLights.length; i += 1) Assign(this.fireLights[i], candidates[i + 1]);
    this.muzzle.intensity = this.muzzleBase * MuzzleEnvelope(this.muzzleAge, this.muzzleDuration);
    if (this.muzzleAge < this.muzzleDuration) this.muzzleAge += step;
  }

  Inspect() {
    return {
      sun: { intensity: this.sun.intensity, color: this.sun.color.getHex(), direction: this.sunDirection.toArray(), shadow: this.sun.castShadow },
      probe: this.globalProbe.intensity, ambient: { intensity: this.ambient.intensity, color: this.ambient.color.getHex() },
      flareSceneScale: this.flareSceneScale,
      fires: this.fireSources.size, explosions: this.explosionEnvelopes.length,
      active: [this.shadowLight, ...this.fireLights, this.muzzle].filter((light) => light.intensity > 0).length,
    };
  }
}
