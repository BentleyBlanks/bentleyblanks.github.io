// Script_CameraProfileTest.mjs —— 统一固化相机后处理档案（CameraProfile）纯 Node 门禁。
// 口径：AGENTS.md 契约 12、docs/Data_TechRenderPipeline.md §1.1.1。
// 跑法：node Taierzhuang1938/Script_CameraProfileTest.mjs
//
// 守五件事：
//   1. Data_CameraProfile.mjs 纯数据、零 three、可原样 JSON 序列化、完全冻结，且与第一关白天基线逐项一致；
//      editorLite 的 Three ACESFilmic 曝光与 standard 的 Hill ACES 曝光严格等价（exposure × 0.6）；
//   2. QUALITY_PRESETS 四档画质（low / medium / high / ultra）后处理开关完全统一；
//   3. 玩家画面设置（CreateGameGraphics / GraphicsDetailControls / LoadSavedGraphics）不含任何冻结键，
//      旧存档中的后处理美术键读写自动剔除；
//   4. BuildStandardPostOptions 无论传入昼/昏/夜预设或自定义 fog.grade，输出的后处理参数全部锁定白天基线，
//      同时保留白名单运行期覆写（fog / volumetricPreset / dof / nearDof / 玩法生理反馈 / renderLinearHdr / outputViewport）；
//   5. 全仓静态审计：除 Script_CameraProfile.mjs 外不得直接 new PostPipeline(；3D WebGLRenderer 入口须接入
//      CameraProfile；业务与工具不得越权直接写 renderer.toneMapping* 或调后处理美术参数 setter。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAMERA_PROFILE_SCHEMA,
  CAMERA_PROFILE_RUNTIME_OVERRIDES,
  CAMERA_PROFILE_FROZEN_SETTINGS_KEYS,
  CAMERA_PROFILES,
} from "./Data_CameraProfile.mjs";
import {
  StripFrozenCameraSettings,
  IsFrozenCameraSettingKey,
  BuildStandardPostOptions,
  ApplyEditorLiteCameraProfile,
  CreateEditorLiteBlit,
} from "./Script_CameraProfile.mjs";
import { QUALITY_PRESETS, GRAPHICS_PROFILES } from "./Data_Tuning_Graphics.mjs";
import { GRADE_DEFAULTS } from "./Data_Tuning_Camera.mjs";
import { CreateGameGraphics } from "./Script_Tuning_GameGraphics.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
const Check = (ok, what) => {
  assert.ok(ok, what);
  checks += 1;
};

// ===========================================================================
// 1. 纯数据契约与白天基线对齐
// ===========================================================================
{
  const dataSource = fs.readFileSync(path.join(projectDir, "Data_CameraProfile.mjs"), "utf8");
  Check(!/from\s+["']three["']/.test(dataSource), "Data_CameraProfile.mjs 零 three 依赖");
  Check(CAMERA_PROFILE_SCHEMA === "tengxian-camera-profile/1", `schema 版本正确：${CAMERA_PROFILE_SCHEMA}`);
  Check(
    JSON.stringify(Object.keys(CAMERA_PROFILES).sort()) === JSON.stringify(["editorLite", "standard"]),
    "全项目仅存在 standard 与 editorLite 两套相机档案",
  );
  // 纯 JSON 序列化往返无损
  const roundTripped = JSON.parse(JSON.stringify(CAMERA_PROFILES));
  assert.deepEqual(roundTripped, CAMERA_PROFILES, "CAMERA_PROFILES 可原样 JSON 序列化");
  checks += 1;
  Check(Object.isFrozen(CAMERA_PROFILES) && Object.isFrozen(CAMERA_PROFILES.standard) && Object.isFrozen(CAMERA_PROFILES.editorLite),
    "CAMERA_PROFILES 与两套子档案均已冻结");
  Check(Object.isFrozen(CAMERA_PROFILES.standard.grade) && Object.isFrozen(CAMERA_PROFILES.standard.bloom)
    && Object.isFrozen(CAMERA_PROFILES.standard.grain) && Object.isFrozen(CAMERA_PROFILES.standard.ao),
    "standard 内部嵌套块均已冻结");

  const S = CAMERA_PROFILES.standard;
  const L = CAMERA_PROFILES.editorLite;
  const day = SKY_PRESETS.firstLevelBattleDay;
  Check(S.exposure === day.exposure, `standard.exposure(${S.exposure}) === firstLevelBattleDay.exposure(${day.exposure})`);
  Check(S.bloom.strength === day.bloom && S.bloom.threshold === (day.bloomThreshold ?? 1.18),
    "standard.bloom 与第一关白天基线一致");
  Check(S.grade.saturation === day.saturation && S.grade.contrast === day.contrast
    && S.grade.contrastCurve === day.fog.grade.contrastCurve,
    "standard.grade 饱和度/对比度/曲线与白天基线一致");
  assert.deepEqual([...S.grade.lift], [...(day.fog.grade.lift ?? GRADE_DEFAULTS.lift)]);
  assert.deepEqual([...S.grade.gain], [...(day.fog.grade.gain ?? GRADE_DEFAULTS.gain)]);
  assert.deepEqual([...S.grade.shadowTint], [...(day.fog.grade.shadowTint ?? GRADE_DEFAULTS.shadowTint)]);
  assert.deepEqual([...S.grade.highlightTint], [...(day.fog.grade.highlightTint ?? GRADE_DEFAULTS.highlightTint)]);
  checks += 1;
  Check(S.grade.shadow === (day.fog.grade.shadow ?? GRADE_DEFAULTS.shadow)
    && S.grade.highlight === (day.fog.grade.highlight ?? GRADE_DEFAULTS.highlight),
    "standard.grade 分离调色权重与白天基线一致");
  Check(L.toneMapping === "ACESFilmicToneMapping" && L.outputColorSpace === "srgb",
    "editorLite 仅使用 Three.js 默认 ACESFilmic + sRGB");
  Check(L.pipeline === "three" && L.bloom === false && L.taa === false && L.lensFlare === false
    && L.lut === false && L.autoExposure === false && L.grain === false && L.vignette === false,
    "editorLite 关闭全部重型后处理");
  Check(Math.abs(L.toneMappingExposure - S.exposure * L.threeAcesExposureScale) < 1e-9,
    `editorLite.toneMappingExposure(${L.toneMappingExposure}) === standard.exposure * 0.6`);
  Check(CAMERA_PROFILE_RUNTIME_OVERRIDES.includes("dof") && CAMERA_PROFILE_RUNTIME_OVERRIDES.includes("volumetrics"),
    "运行期局部覆写白名单包含 dof 与 volumetrics");
}

// ===========================================================================
// 2. 四档画质统一后处理开关
// ===========================================================================
{
  const S = CAMERA_PROFILES.standard;
  for (const tier of GRAPHICS_PROFILES) {
    const p = QUALITY_PRESETS[tier];
    Check(p.taa === S.taa && p.taaUpscale === true, `${tier} 档开启统一 TAA / TAAU`);
    Check(p.autoExposure === S.autoExposure && p.lut === S.lut && p.localTonemap === S.localTonemap
      && p.filmOptics === S.filmOptics, `${tier} 档相机后处理开关与 standard 一致`);
    Check(p.bloomLevels === 6 && p.godrays === false && p.motionBlur === true && p.dof === true
      && p.filmGrain === 1 && p.sharpen === S.sharpen,
      `${tier} 档 Bloom/MotionBlur/DoF/颗粒/锐化与 standard 一致`);
  }
}

// ===========================================================================
// 3. 玩家画质设置收口与旧存档过滤
// ===========================================================================
{
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
  const { GraphicsDetailControls, LoadSavedGraphics } = await import("./Script_EditorSettings.mjs");

  const gfx = CreateGameGraphics({ profile: "high", preset: QUALITY_PRESETS.high });
  const leaked = CAMERA_PROFILE_FROZEN_SETTINGS_KEYS.filter((key) => Object.hasOwn(gfx, key));
  Check(leaked.length === 0, `CreateGameGraphics 不得包含冻结后处理键，发现：${leaked.join(", ")}`);

  const detailControls = GraphicsDetailControls({ preset: QUALITY_PRESETS.high });
  const controlKeys = Object.values(detailControls).flat().map((c) => c.key);
  const leakedControls = controlKeys.filter((key) => IsFrozenCameraSettingKey(key));
  Check(leakedControls.length === 0, `GraphicsDetailControls 不得暴露冻结键，发现：${leakedControls.join(", ")}`);

  const polluted = { renderScale: 0.75, fov: 64, volumetrics: false, ssr: false, gore: false };
  for (const key of CAMERA_PROFILE_FROZEN_SETTINGS_KEYS) polluted[key] = 999;
  const cleaned = StripFrozenCameraSettings(polluted);
  Check(CAMERA_PROFILE_FROZEN_SETTINGS_KEYS.every((key) => !(key in cleaned)), "StripFrozenCameraSettings 剔除全部冻结键");
  Check(cleaned.renderScale === 0.75 && cleaned.fov === 64 && cleaned.volumetrics === false && cleaned.ssr === false && cleaned.gore === false,
    "StripFrozenCameraSettings 保留硬件/性能与玩法键");

  memory.set("tengxian1938_graphics_v1", JSON.stringify(polluted));
  const restored = CreateGameGraphics({ profile: "high", preset: QUALITY_PRESETS.high });
  LoadSavedGraphics(restored);
  Check(restored.renderScale === 0.75 && restored.fov === 64 && restored.volumetrics === false, "LoadSavedGraphics 恢复允许的键");
  Check(CAMERA_PROFILE_FROZEN_SETTINGS_KEYS.every((key) => !(key in restored)), "LoadSavedGraphics 绝不把旧存档冻结键灌回 graphics");
}

// ===========================================================================
// 4. 昼夜切换不改后处理 & 运行期白名单覆写生效
// ===========================================================================
{
  const day = SKY_PRESETS.firstLevelBattleDay;
  const night = SKY_PRESETS.firstLevelNight;
  const dusk = SKY_PRESETS.dusk;
  const optDay = BuildStandardPostOptions({
    fog: day.fog, volumetricPreset: "firstLevelBattleDay", sunColor: day.sunColor,
  });
  const optNight = BuildStandardPostOptions({
    fog: { ...night.fog, grade: { lift: [0.5, 0.5, 0.5], gain: [2, 2, 2], shadow: 0.9 } },
    volumetricPreset: "firstLevelNight",
    sunColor: night.sunColor,
  });
  const optDusk = BuildStandardPostOptions({
    fog: dusk.fog, volumetricPreset: "dusk", sunColor: dusk.sunColor,
  });

  for (const key of ["exposure", "exposureProfile", "bloom", "bloomThreshold", "godStrength",
    "saturation", "contrast", "grain", "grainSize", "vignette", "aberration", "purkinje", "lensFlare"]) {
    Check(optDay[key] === optNight[key] && optDay[key] === optDusk[key],
      `昼/昏/夜切换不得改动后处理字段 ${key}（day=${optDay[key]} night=${optNight[key]} dusk=${optDusk[key]}）`);
  }
  assert.deepEqual(optNight.grade, CAMERA_PROFILES.standard.grade, "夜晚自定义 fog.grade 不得覆写固化 grade");
  checks += 1;
  Check(optNight.skyPreset === "firstLevelNight" && optNight.exposureProfile === "firstLevelBattleDay",
    "夜晚体积雾仍读 firstLevelNight，自动曝光档案仍锁 firstLevelBattleDay");

  const override = BuildStandardPostOptions({
    fog: night.fog,
    volumetricPreset: "firstLevelNight",
    dof: { strength: 0.8, focus: 4.5, range: 1.2, maxPx: 14 },
    nearDof: { strength: 0.6, focus: 0.65, range: 0.3, maxPx: 10, sightUv: [0.5, 0.5] },
    damage: 0.4,
    suppression: 0.5,
    fade: 0.2,
    eyeClosure: 0.3,
    outputViewport: { x: 10, y: 20, w: 640, h: 360 },
  });
  Check(override.dofStrength === 0.8 && override.dofFocus === 4.5 && override.nearDofStrength === 0.6,
    "DoF / 近景散焦局部覆写正常透传");
  Check(override.damage === 0.4 && override.fade === 0.2 && override.eyeClosure === 0.3
    && override.vignette > CAMERA_PROFILES.standard.vignette && override.saturation < CAMERA_PROFILES.standard.grade.saturation,
    "玩法瞬态生理反馈正常透传");
  Check(override.outputViewport?.w === 640, "信箱 outputViewport 正常透传");

  // ApplyEditorLiteCameraProfile & CreateEditorLiteBlit 行为校验
  const fakeRenderer = { toneMapping: 0, toneMappingExposure: 1, outputColorSpace: "" };
  ApplyEditorLiteCameraProfile(fakeRenderer);
  Check(fakeRenderer.toneMappingExposure === CAMERA_PROFILES.editorLite.toneMappingExposure
    && fakeRenderer.outputColorSpace === "srgb"
    && fakeRenderer.userData.cameraProfileId === "editorLite",
    "ApplyEditorLiteCameraProfile 正确配置简易编辑器映射");
  const liteBlit = CreateEditorLiteBlit();
  Check(liteBlit.cameraProfileId === CAMERA_PROFILES.editorLite.id
    && typeof liteBlit.Render === "function" && typeof liteBlit.Dispose === "function",
    "CreateEditorLiteBlit 导出完整离屏 ACESFilmic 输出器接口");
  liteBlit.Dispose();
}

// ===========================================================================
// 5. 全仓静态审计（渲染入口与越权修改拦阻）
// ===========================================================================
{
  const NON_SCENE_RENDERERS = new Set([
    "Script_TextureManager.mjs",      // 2D 贴图管理/解码工具上下文
    "Script_FrameDebugMesh.mjs",      // 离线线框/网格预览图辅助上下文
    "Script_HudWeaponSilhouette.mjs", // HUD 武器剪影离屏 2D 图标烘焙上下文
    "Script_MenuStartup.mjs",         // 创建共享主画布后立即交给 CommandRoom（内部走 Script_CameraProfile）
  ]);
  const TONE_RESTORE_ALLOWLIST = new Set([
    "Script_CameraProfile.mjs",
    "Script_CommandRoom.mjs",
    "Script_WeaponInspectionScene.mjs",
    "Script_WeaponMaterialPreview.mjs",
  ]);
  const StripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

  const scanDirs = [projectDir, path.join(projectDir, "AdvancedTools")];
  const directPostNew = [];
  const unregisteredRenderers = [];
  const rogueToneWrites = [];
  const rogueSetters = [];

  for (const dir of scanDirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(mjs|html)$/.test(file)) continue;
      if (/Test.*\.mjs$|^Script_Post.*\.mjs$|^Script_CameraProfile\.mjs$|^Data_CameraProfile\.mjs$|^Script_ToneMapCurves\.mjs$/.test(file)) continue;
      const fullPath = path.join(dir, file);
      const raw = fs.readFileSync(fullPath, "utf8");
      const code = StripComments(raw);
      const rel = path.relative(projectDir, fullPath).replace(/\\/g, "/");

      if (/\bnew\s+PostPipeline\s*\(/.test(code)) {
        directPostNew.push(rel);
      }
      if (/\bnew\s+(?:THREE\.)?WebGLRenderer\s*\(/.test(code) && !NON_SCENE_RENDERERS.has(file)) {
        if (!/Script_CameraProfile\.mjs/.test(raw)) {
          unregisteredRenderers.push(rel);
        }
      }
      if (!TONE_RESTORE_ALLOWLIST.has(file) && /\.toneMapping(?:Exposure)?\s*=/.test(code)) {
        rogueToneWrites.push(rel);
      }
      if (/\.(SetTonemap|SetFilmLook|SetAutoExposure|SetLutEnabled|SetLocalTonemap|SetFilmOptics|SetTaaEnabled)\s*\(/.test(code)) {
        rogueSetters.push(rel);
      }
    }
  }

  Check(directPostNew.length === 0, `禁止在 Script_CameraProfile.mjs 外直接 new PostPipeline(：${directPostNew.join(", ")}`);
  Check(unregisteredRenderers.length === 0, `3D WebGLRenderer 未接入 Script_CameraProfile.mjs：${unregisteredRenderers.join(", ")}`);
  Check(rogueToneWrites.length === 0, `业务/工具代码不得直接改 renderer.toneMapping*：${rogueToneWrites.join(", ")}`);
  Check(rogueSetters.length === 0, `业务/工具代码不得直接调后处理美术参数 setter：${rogueSetters.join(", ")}`);
}

console.log(`PASS CameraProfileTest: ${checks} checks passed`);
