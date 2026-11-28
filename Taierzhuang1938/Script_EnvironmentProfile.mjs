// 《台儿庄：血战滕县》统一游戏环境光照装配入口（与 Script_CameraProfile.mjs 并列）。
//
// 所有独立工具与轻量三维场景统一经本模块复用游戏环境配置（默认 firstLevelBattleDay /
// Environment/EnvPreset_FirstLevel.json 白天 12:00），禁止各自手写 HemisphereLight、
// 多余棚拍补光灯或 STUDIO_EXPOSURE_COMPENSATION 硬编码倍率：
//   - 太阳平行光（preset.lightColor / preset.lightIntensity / sunDirection）
//   - 全局 SH 天光探针（Data_GlobalShProbe.GLOBAL_SH_PROBE_COEFFICIENTS × preset.shProbeIntensity）
//   - 环境底色（preset.ambientColor / preset.ambientIntensity）
//   - 物理大气天空 IBL（SkyDome + atmosphere: true → PMREM 或 CubeTexture，乘 preset.envIntensity）
//
// 静态门禁：Script_EnvironmentProfileTest.mjs。

import * as THREE from "three";
import { GLOBAL_SH_PROBE_COEFFICIENTS } from "./Data_GlobalShProbe.mjs";
import { SKY_PRESETS, SkyDome, SunDirectionFrom } from "./Script_Sky.mjs";
import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { EnvPresetUrl, ValidateEnvPreset } from "./Script_EnvPreset.mjs";
import { EvaluatePreset, OffValues } from "./Script_EnvSystem.mjs";
import { ComposeEnvironment } from "./Script_EnvComponents.mjs";

export const DEFAULT_ENVIRONMENT_PRESET_NAME = "firstLevelBattleDay";
export const DEFAULT_ENV_PRESET_ID = "FirstLevel";

/** 解析环境参数（接受 SKY_PRESETS 预设名，或组件式环境系统求值后的同形对象）。 */
export function ResolveGameEnvironmentPreset(presetOrName = DEFAULT_ENVIRONMENT_PRESET_NAME) {
  if (presetOrName && typeof presetOrName === "object") {
    return {
      name: presetOrName.profile || DEFAULT_ENVIRONMENT_PRESET_NAME,
      preset: presetOrName,
    };
  }
  const name = (typeof presetOrName === "string" && SKY_PRESETS[presetOrName])
    ? presetOrName
    : DEFAULT_ENVIRONMENT_PRESET_NAME;
  return { name, preset: SKY_PRESETS[name] };
}

/**
 * 异步读取 Environment/EnvPreset_<Id>.json 并按指定时刻求值为与 SKY_PRESETS 同形的环境参数，
 * 供需要直接加载磁盘环境预设或切换昼夜时段的独立工具复用。
 */
export async function LoadGameEnvironmentPreset(presetId = DEFAULT_ENV_PRESET_ID, hour = 12, {
  fetchFn = globalThis.fetch,
  base = globalThis.document?.baseURI,
} = {}) {
  const relUrl = EnvPresetUrl(presetId);
  const url = base ? new URL(relUrl, base).href : relUrl;
  const response = await fetchFn(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`环境预设 ${presetId} 读取失败（HTTP ${response.status}）`);
  const doc = await response.json();
  const check = ValidateEnvPreset(doc);
  if (!check.ok) throw new Error(`环境预设 ${presetId} 校验失败：${check.errors.slice(0, 3).join("；")}`);
  const values = EvaluatePreset(doc, hour);
  const states = ENV_COMPONENTS.map((decl) => ({
    decl,
    values: values[decl.type] ?? OffValues(decl),
  }));
  const preset = ComposeEnvironment(states);
  return { id: presetId, hour, doc, preset, values };
}

function BakeSkyEnvironment(renderer, scene, presetOrName, {
  skyMode = "pmrem",
  cubeSize = 256,
} = {}) {
  if (skyMode === "none" || !renderer) {
    const { preset } = ResolveGameEnvironmentPreset(presetOrName);
    const sunDirection = SunDirectionFrom(preset.sunElevation ?? 52, preset.sunAzimuth ?? 35).normalize();
    return { preset, sunDirection, target: null, texture: null };
  }
  const usePmrem = skyMode === "pmrem";
  const sky = new SkyDome(renderer, { radius: 32, atmosphere: true, environment: usePmrem });
  let target = null;
  try {
    const preset = sky.Apply(presetOrName);
    const sunDirection = sky.sunDirection.clone().normalize();
    if (usePmrem) {
      sky.BakeEnvironment(scene);
      // 保留烘焙出的 PMREM 渲染靶给调用方管理生命周期；sky.Dispose() 不再误删它。
      target = sky.envTarget;
      sky.envTarget = null;
      return { preset, sunDirection, target, texture: target?.texture ?? null };
    }
    const cubeScene = new THREE.Scene();
    cubeScene.add(sky.mesh);
    target = new THREE.WebGLCubeRenderTarget(cubeSize, { type: THREE.HalfFloatType });
    new THREE.CubeCamera(0.1, 64, target).update(renderer, cubeScene);
    if (scene) {
      scene.environment = target.texture;
      scene.environmentIntensity = preset.envIntensity ?? 1;
    }
    return { preset, sunDirection, target, texture: target.texture };
  } catch (error) {
    target?.dispose();
    throw error;
  } finally {
    sky.Dispose();
  }
}

/**
 * 给独立工具或轻量三维舞台装配与游戏正片同源的环境光照：
 *   1. 主太阳平行光（可选单级阴影图 + FitShadow 包围球拟合）
 *   2. 全局 SH 天光探针（GLOBAL_SH_PROBE_COEFFICIENTS）
 *   3. 环境底色 AmbientLight
 *   4. 物理大气天空环境贴图（PMREM 或 CubeTexture，乘 preset.envIntensity）
 */
export function CreateGameEnvironmentLighting(renderer, scene, {
  preset = DEFAULT_ENVIRONMENT_PRESET_NAME,
  skyMode = "pmrem",
  cubeSize = 256,
  shadow = false,
  sunDistance = 1,
} = {}) {
  const resolved = ResolveGameEnvironmentPreset(preset);
  let baked = BakeSkyEnvironment(renderer, scene, preset, { skyMode, cubeSize });
  let currentPreset = baked.preset;
  let currentPresetName = resolved.name;
  const sunDirection = baked.sunDirection.clone();
  let skyTarget = baked.target;

  const sun = new THREE.DirectionalLight(currentPreset.lightColor ?? 0xfff2df, currentPreset.lightIntensity ?? 4.6);
  sun.name = "GameEnvSun";
  sun.position.copy(sunDirection).multiplyScalar(sunDistance);
  if (shadow) {
    const cfg = typeof shadow === "object" ? shadow : {};
    const mapSize = cfg.mapSize ?? 2048;
    sun.castShadow = true;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.autoUpdate = cfg.autoUpdate ?? false;
    if (Number.isFinite(cfg.bias)) sun.shadow.bias = cfg.bias;
    if (Number.isFinite(cfg.normalBias)) sun.shadow.normalBias = cfg.normalBias;
    if (Number.isFinite(cfg.radius)) sun.shadow.radius = cfg.radius;
    if (cfg.frustum) {
      Object.assign(sun.shadow.camera, cfg.frustum);
      sun.shadow.camera.updateProjectionMatrix();
    }
    if (cfg.needsUpdate !== false) sun.shadow.needsUpdate = true;
  }
  scene.add(sun, sun.target);

  const globalProbe = new THREE.LightProbe();
  globalProbe.name = "GameEnvGlobalProbe";
  globalProbe.sh.fromArray(GLOBAL_SH_PROBE_COEFFICIENTS);
  globalProbe.intensity = currentPreset.shProbeIntensity ?? 0.34;
  scene.add(globalProbe);

  const ambient = new THREE.AmbientLight(
    currentPreset.ambientColor ?? 0x607085,
    currentPreset.ambientIntensity ?? 0.16,
  );
  ambient.name = "GameEnvAmbient";
  scene.add(ambient);

  const handle = {
    get presetName() { return currentPresetName; },
    get preset() { return currentPreset; },
    get skyTarget() { return skyTarget; },
    sunDirection,
    sun,
    globalProbe,
    ambient,

    /** 切换为另一套 SKY_PRESETS 预设或环境系统求值结果，同步更新三盏光源与天空 IBL。 */
    ApplyPreset(nextPresetOrName) {
      const next = ResolveGameEnvironmentPreset(nextPresetOrName);
      const prevTarget = skyTarget;
      baked = BakeSkyEnvironment(renderer, scene, nextPresetOrName, { skyMode, cubeSize });
      if (prevTarget && prevTarget !== baked.target) prevTarget.dispose();
      skyTarget = baked.target;
      currentPreset = baked.preset;
      currentPresetName = next.name;
      sunDirection.copy(baked.sunDirection);
      sun.color.setHex(currentPreset.lightColor ?? 0xfff2df);
      sun.intensity = currentPreset.lightIntensity ?? 4.6;
      sun.position.copy(sunDirection).multiplyScalar(sunDistance);
      globalProbe.intensity = currentPreset.shProbeIntensity ?? 0.34;
      ambient.color.setHex(currentPreset.ambientColor ?? 0x607085);
      ambient.intensity = currentPreset.ambientIntensity ?? 0.16;
      if (sun.castShadow) sun.shadow.needsUpdate = true;
      return currentPreset;
    },

    /** 按单模型/局部舞台的包围球拟合单级阴影框。 */
    FitShadow(center, radius, { nearScale = 0.5, farScale = 3.5, normalBias = null } = {}) {
      if (!sun.castShadow) return;
      const r = Math.max(Number(radius) || 0.05, 0.001);
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(sunDirection, 2 * r);
      sun.target.updateMatrixWorld();
      const cam = sun.shadow.camera;
      cam.left = cam.bottom = -r;
      cam.right = cam.top = r;
      cam.near = r * nearScale;
      cam.far = r * farScale;
      cam.updateProjectionMatrix();
      if (Number.isFinite(normalBias)) sun.shadow.normalBias = normalBias;
      sun.shadow.needsUpdate = true;
    },

    /** 将本环境的三盏游戏光源与 IBL 克隆到辅助子场景（如第一人称预览、材质球预览）。 */
    CloneLightsTo(targetScene, { sunDistance: dist = 1 } = {}) {
      targetScene.environment = scene.environment;
      targetScene.environmentIntensity = scene.environmentIntensity;
      const clonedSun = sun.clone();
      clonedSun.castShadow = false;
      clonedSun.position.copy(sunDirection).multiplyScalar(dist);
      const clonedProbe = globalProbe.clone();
      const clonedAmbient = ambient.clone();
      targetScene.add(clonedSun, clonedProbe, clonedAmbient);
      return { sun: clonedSun, globalProbe: clonedProbe, ambient: clonedAmbient };
    },

    Dispose() {
      if (skyTarget) {
        if (scene.environment === skyTarget.texture) scene.environment = null;
        skyTarget.dispose();
        skyTarget = null;
      }
      sun.removeFromParent();
      sun.target.removeFromParent();
      globalProbe.removeFromParent();
      ambient.removeFromParent();
    },
  };
  return handle;
}
