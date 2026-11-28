// Script_EnvironmentProfileTest.mjs —— 统一游戏环境光照装配（Script_EnvironmentProfile）纯 Node 门禁。
// 口径：AGENTS.md 契约 12（统一相机档案 + 统一游戏环境光照复用）。
// 跑法：node Taierzhuang1938/Script_EnvironmentProfileTest.mjs
//
// 守四件事：
//   1. CSM 阴影预设（MakeShadowPreset）支持 1 级模式（cascades: 1），供轻量工具与单模型舞台复用；
//   2. 第一关正式环境预设（Environment/EnvPreset_FirstLevel.json）12:00 白天求值结果与
//      Data_EnvComponents 默认值及 CAMERA_PROFILES.standard 白天基线一致；
//   3. Script_EnvironmentProfile.mjs 位于游戏核心目录，不反向 import ./AdvancedTools/；
//   4. 全仓 AdvancedTools/ 静态审计：
//      - 禁止残留 STUDIO_EXPOSURE_COMPENSATION / STUDIO_ENVIRONMENT_INTENSITY；
//      - 禁止手写 new THREE.HemisphereLight(；
//      - 禁止在受许可的环境适配器之外私自 new THREE.DirectionalLight / AmbientLight / LightProbe；
//      - 所有 3D WebGLRenderer 工具必须接入受许可的游戏环境入口。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MakeShadowPreset, SHADOW_PRESETS } from "./Data_Tuning_Shadows.mjs";
import { CAMERA_PROFILES } from "./Data_CameraProfile.mjs";
import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { ValidateEnvPreset } from "./Script_EnvPreset.mjs";
import { EvaluatePreset, OffValues } from "./Script_EnvSystem.mjs";
import { ComposeEnvironment } from "./Script_EnvComponents.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const toolsDir = path.join(projectDir, "AdvancedTools");
let checks = 0;
const Check = (ok, what) => {
  assert.ok(ok, what);
  checks += 1;
};

const StripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");

// ===========================================================================
// 1. CSM 1 级阴影预设支持
// ===========================================================================
{
  for (const tier of Object.keys(SHADOW_PRESETS)) {
    const base = MakeShadowPreset(tier);
    const single = MakeShadowPreset(tier, { cascades: 1 });
    Check(single.cascades === 1, `${tier} 档传 cascades: 1 时级数为 1`);
    Check(single.maxRadius.length === 1 && single.maxRadius[0] === base.maxRadius[0],
      `${tier} 档 1 级模式保留近级 maxRadius`);
    Check(single.bakeOrder.length === 1 && single.bakeOrder[0] === 0,
      `${tier} 档 1 级模式 bakeOrder 为 [0]`);
    Check(single.pcssLevels <= 1, `${tier} 档 1 级模式 pcssLevels <= 1`);
    Check(base.cascades === SHADOW_PRESETS[tier].cascades,
      `${tier} 档不传 cascades 时保持原有级数（${base.cascades}）`);
  }
}

// ===========================================================================
// 2. 第一关正式环境预设 12:00 白天基线一致性
// ===========================================================================
{
  const presetDoc = JSON.parse(fs.readFileSync(path.join(projectDir, "Environment", "EnvPreset_FirstLevel.json"), "utf8"));
  const validation = ValidateEnvPreset(presetDoc);
  Check(validation.ok, `EnvPreset_FirstLevel.json 校验通过：${validation.errors.join("；")}`);
  const evaluated = EvaluatePreset(presetDoc, 12);
  const states = ENV_COMPONENTS.map((decl) => ({
    decl,
    values: evaluated[decl.type] ?? OffValues(decl),
  }));
  const preset = ComposeEnvironment(states);
  Check(preset.profile === CAMERA_PROFILES.standard.skyPreset,
    `EnvPreset_FirstLevel @ 12:00 后期档案与 standard 基线一致（${preset.profile}）`);
  Check(preset.lightIntensity > 0 && preset.shProbeIntensity > 0 && preset.ambientIntensity > 0 && preset.envIntensity > 0,
    "EnvPreset_FirstLevel @ 12:00 具备完整太阳光、全局 SH、环境底色与 IBL 强度");
}

// ===========================================================================
// 3. Script_EnvironmentProfile.mjs 模块边界与接口检查
// ===========================================================================
{
  const profilePath = path.join(projectDir, "Script_EnvironmentProfile.mjs");
  Check(fs.existsSync(profilePath), "核心模块 Script_EnvironmentProfile.mjs 存在");
  const raw = fs.readFileSync(profilePath, "utf8");
  const code = StripComments(raw);
  Check(!/AdvancedTools\//.test(code), "Script_EnvironmentProfile.mjs 不反向依赖 AdvancedTools/");
  Check(/export\s+function\s+CreateGameEnvironmentLighting\b/.test(code)
    && /export\s+async\s+function\s+LoadGameEnvironmentPreset\b/.test(code)
    && /export\s+function\s+ResolveGameEnvironmentPreset\b/.test(code),
    "Script_EnvironmentProfile.mjs 导出统一装配与预设读取接口");
}

// ===========================================================================
// 4. AdvancedTools/ 全量静态审计：禁止私写棚拍光与硬编码曝光倍率
// ===========================================================================
{
  const NON_3D_RENDERERS = new Set([
    "Script_TextureManager.mjs", // 2D 贴图管理/解码工具上下文
  ]);
  const SANCTIONED_LIGHT_ADAPTERS = new Set([
    "Script_SceneEditorEnvironment.mjs", // 场景编辑器环境适配器（接入 EnvironmentSystem + SkyDome）
    "Script_VfxPreviewLights.mjs",       // 特效预览灯光适配器（由 Script_VfxPreviewEnvironment 驱动）
  ]);
  const SANCTIONED_ENV_IMPORT_RE = /(?:Script_EnvironmentProfile|Script_ToolStudioRenderBase|Script_SceneEditorEnvironment|Script_VfxPreviewLights|Script_VfxPreviewEnvironment|Script_Light)\.mjs/;

  const studioCompensationHits = [];
  const hemisphereHits = [];
  const rogueLightHits = [];
  const unlinkedRenderers = [];

  for (const file of fs.readdirSync(toolsDir)) {
    if (!/\.mjs$/.test(file) || /Test\.mjs$/.test(file)) continue;
    const fullPath = path.join(toolsDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const code = StripComments(raw);
    const rel = path.relative(projectDir, fullPath).replace(/\\/g, "/");

    if (/\bSTUDIO_EXPOSURE_COMPENSATION\b|\bSTUDIO_ENVIRONMENT_INTENSITY\b/.test(code)) {
      studioCompensationHits.push(rel);
    }
    if (/\bnew\s+(?:THREE\.)?HemisphereLight\s*\(/.test(code)) {
      hemisphereHits.push(rel);
    }
    if (!SANCTIONED_LIGHT_ADAPTERS.has(file)
      && /\bnew\s+(?:THREE\.)?(?:DirectionalLight|AmbientLight|LightProbe)\s*\(/.test(code)) {
      rogueLightHits.push(rel);
    }
    if (/\bnew\s+(?:THREE\.)?WebGLRenderer\s*\(/.test(code) && !NON_3D_RENDERERS.has(file)) {
      if (!SANCTIONED_ENV_IMPORT_RE.test(raw)) {
        unlinkedRenderers.push(rel);
      }
    }
  }

  Check(studioCompensationHits.length === 0,
    `AdvancedTools/ 不得残留棚拍曝光倍率常量：${studioCompensationHits.join(", ")}`);
  Check(hemisphereHits.length === 0,
    `AdvancedTools/ 不得手写 HemisphereLight 替代游戏天光探针：${hemisphereHits.join(", ")}`);
  Check(rogueLightHits.length === 0,
    `AdvancedTools/ 不得在受许可适配器之外私建场景主光/环境光：${rogueLightHits.join(", ")}`);
  Check(unlinkedRenderers.length === 0,
    `AdvancedTools/ 所有 3D WebGLRenderer 工具须接入游戏环境光照入口：${unlinkedRenderers.join(", ")}`);
}

console.log(`ok  EnvironmentProfileTest：${checks} 项全过`);
