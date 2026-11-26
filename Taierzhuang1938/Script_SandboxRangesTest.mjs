// 测试场登记表 / 按需插件 / 独立场景文件 / 玩法时钟的门禁（docs/Data_SandboxRanges.md，纯 Node，秒级）。
//
// 守五件事：
//   1. 登记表每一行都有独立插件加载器、独立场景文件（且过 ValidateScene），关卡 id 不重；开机路由与菜单认的开关就是这张表。
//   2. 玩法时钟：按 order 先后叠加、可撤、能返回 0（暂停）与固定步长（单步），realDt 原样留着。
//   3. Script_Main 与每帧系统不出现测试场的名字；Script_SandboxRanges 本身只做动态 import()，不静态拖入测试场代码。
//   4. 插件实例只接它声明过的钩子（没声明的装配层一律不调）。
//   5. 靶场与白刃实验场运行时交回预期取证口与钩子。

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { SANDBOX_RANGES, SANDBOX_RANGE_KEYS, SandboxRangeFromParams, SandboxRangeForPhase } from "./Data_SandboxRanges.mjs";
import { SCENE_IDS } from "./Script_SceneDoc.mjs";
import { ValidateScene } from "./Script_SceneDoc.mjs";
import { ReadSceneSync } from "./Script_SceneNode.mjs";
import { GameClock, CLOCK_ORDER } from "./Script_GameClock.mjs";
import { IsMenuStartup, SandboxUrl } from "./Data_StartupRouting.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));
const vendor = new URL("./vendor/three/", import.meta.url);
const hooks = registerHooks({
  resolve(id, context, next) {
    return id === "three" ? { url: new URL("build/three.module.js", vendor).href, shortCircuit: true } : next(id, context);
  },
  load(url, context, next) {
    return url.startsWith(vendor.href) && url.endsWith(".js")
      ? { format: "module", source: fs.readFileSync(new URL(url), "utf8"), shortCircuit: true } : next(url, context);
  },
});
const {
  SANDBOX_PLUGIN_IDS, LoadAllSandboxPlugins, SandboxPluginFor, SandboxForPhase, SandboxWorldClasses, SandboxDebugStubs,
} = await import("./Script_SandboxRanges.mjs");
const SANDBOX_PLUGINS = await LoadAllSandboxPlugins();
hooks.deregister();

let checks = 0;
const Check = (ok, message) => { assert.ok(ok, message); checks += 1; };

// 1. 登记表 ↔ 按需插件 ↔ 独立场景文件
const ids = SANDBOX_RANGES.map((r) => r.id);
Check(new Set(ids).size === ids.length, "登记表 id 不重");
Check(SANDBOX_PLUGIN_IDS.length === SANDBOX_RANGES.length, "每一行都有动态插件加载器");
Check(SANDBOX_PLUGINS.length === SANDBOX_RANGES.length, "每一行都能按需加载出插件");
const phaseIds = new Set();
const checkedScenes = new Set();
for (const plugin of SANDBOX_PLUGINS) {
  Check(plugin.phase && typeof plugin.phase.id === "string", `${plugin.id}: 有关卡表`);
  Check(plugin.entry.phaseId === plugin.phase.id, `${plugin.id}: 登记表 phaseId (${plugin.entry.phaseId}) 与插件 phase.id (${plugin.phase.id}) 一致`);
  Check(!phaseIds.has(plugin.phase.id), `${plugin.id}: 关卡 id ${plugin.phase.id} 不与别的测试场重`);
  phaseIds.add(plugin.phase.id);
  Check(typeof plugin.World === "function", `${plugin.id}: 有场地类`);
  Check(typeof plugin.Create === "function", `${plugin.id}: 有 Create`);
  Check(SandboxForPhase(plugin.phase) === plugin, `${plugin.id}: 按关卡认得回插件`);
  Check(SandboxRangeForPhase(plugin.phase) === plugin.entry, `${plugin.id}: 纯数据按 phase.id 认得回登记行`);
  Check(SandboxWorldClasses()[plugin.phase.id] === plugin.World, `${plugin.id}: 场地类表里有它`);
  Check(SandboxPluginFor(plugin.entry) === plugin, `${plugin.id}: 按登记行认得回插件`);
  Check(!!plugin.entry.sceneId && SCENE_IDS.includes(plugin.entry.sceneId), `${plugin.id}: 对应独立场景 ${plugin.entry.sceneId} 已登记在 SCENE_LIST`);
  if (plugin.entry.kind === "functional") {
    Check(plugin.phase.sceneAsset?.sceneId === plugin.entry.sceneId, `${plugin.id}: phase 挂接了独立场景 ${plugin.entry.sceneId}`);
    if (!checkedScenes.has(plugin.entry.sceneId)) {
      checkedScenes.add(plugin.entry.sceneId);
      const { doc } = ReadSceneSync(plugin.entry.sceneId);
      const v = ValidateScene(doc);
      Check(v.ok, `独立测试场景 ${plugin.entry.sceneId} 过校验：${v.errors.join("；")}`);
    }
  }
  const params = new URLSearchParams(`${plugin.id}=1`);
  Check(SandboxRangeFromParams(params)?.id === plugin.id, `${plugin.id}: ?${plugin.id}=1 选中它`);
  Check(!IsMenuStartup(params), `${plugin.id}: 带这个开关不进正式菜单`);
  Check(new URL(SandboxUrl("http://x/T/?cloth=1&phase=2", plugin.id)).searchParams.get(plugin.id) === "1", `${plugin.id}: 菜单生成的网址打开它`);
}
Check(SandboxRangeFromParams(new URLSearchParams("gore=0")) === null, "?gore=0 是断肢总闸，不是断肢测试场");
Check(SANDBOX_RANGE_KEYS.join() === ids.join(), "开机路由用的开关就是登记表顺序");
Check(IsMenuStartup(new URLSearchParams("")), "什么都不带进正式菜单");

// 1b. Script_SandboxRanges 不静态 import 任何功能测试场模块（确保主包按需分包）
{
  const routerSrc = fs.readFileSync(path.join(dirHere, "Script_SandboxRanges.mjs"), "utf8");
  const staticImports = [...routerSrc.matchAll(/^import\s+.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  Check(staticImports.every((spec) => ["./Data_SandboxRanges.mjs", "./Script_SandboxPlugin_EncounterPlay.mjs"].includes(spec)),
    `Script_SandboxRanges 仅静态导入纯数据登记表与遭遇共用工厂，其余均动态 import()：${staticImports.join(", ")}`);
}

// 2. 玩法时钟
{
  Check(!Object.hasOwn(CLOCK_ORDER, "editor"), "持枪移动观察工具的时钟顺序已删除");
  const clock = new GameClock();
  Check(clock.Step(0.016) === 0.016, "没登记缩放器 = 原样");
  const order = [];
  clock.Add("probe", (dt) => { order.push("probe"); return dt * 0.5; }, 50);
  clock.Add("meleeQte", (dt) => { order.push("meleeQte"); return dt * 0.25; }, CLOCK_ORDER.meleeQte);
  clock.Add("sandbox", (dt) => { order.push("sandbox"); return dt; }, CLOCK_ORDER.sandbox);
  Check(Math.abs(clock.Step(0.016) - 0.016 * 0.25 * 0.5) < 1e-12, "倍率相乘");
  Check(order.join() === "meleeQte,sandbox,probe", "按 order 先后：白刃 QTE → 测试场 → 测试探针（同原 Frame 开头那五行）");
  Check(clock.realDt === 0.016, "真实时间原样留着（QTE 按键窗口用）");
  clock.Add("sandbox", () => 0, CLOCK_ORDER.sandbox);
  Check(clock.Step(0.016) === 0 && clock.State().scalers.length === 3, "同名重登记替换旧的；能暂停");
  clock.Add("sandbox", () => 1 / 60, CLOCK_ORDER.sandbox);
  Check(Math.abs(clock.Step(0.001) - (1 / 60) * 0.5) < 1e-12, "单步：测试场给固定步长，后面的测试探针照样再乘");
  const remove = clock.Add("tmp", (dt) => dt * 3, 99);
  remove();
  clock.Remove("sandbox"); clock.Remove("meleeQte"); clock.Remove("probe");
  Check(clock.Step(0.02) === 0.02 && !clock.Has("tmp"), "撤销后回到原样");
}

// 3. Script_Main 与每帧系统（Script_FrameModes / Script_FrameSteps*）不再认识任何测试场的名字
{
  const frameFiles = ["Script_Main.mjs", "Script_FrameModes.mjs", "Script_FrameStepsPlayer.mjs", "Script_FrameStepsWorld.mjs", "Script_FrameStepsRules.mjs", "Script_FrameStepsPresent.mjs"];
  const main = frameFiles.map((file) => fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n");
  const modes = fs.readFileSync(new URL("./Script_FrameModes.mjs", import.meta.url), "utf8");
  const banned = [
    "ClothRange", "GoreRange", "ShellImpactRange", "BattleReactionRange", "MovementRange", "ExplosionRange", "WeaponRangeRuntime",
    "ClothRangeField", "GoreRangeField", "ShellImpactRangeField", "MovementRangeField", "ExplosionRangeField", "WeaponRangeField",
    "CLOTH_TEST", "GORE_TEST", "IMPACT_TEST", "REACTION_TEST", "MOVEMENT_RANGE", "EXPLOSION_TEST",
    "clothRange", "goreRange", "impactRange", "reactionRange", "movementRange", "weaponRange", "explosionRange",
    "CLOTH_RANGE_ID", "GORE_RANGE_ID", "SHELL_IMPACT_RANGE_ID", "BATTLE_REACTION_RANGE_ID", "MOVEMENT_RANGE_ID", "EXPLOSION_RANGE_ID",
    "RANGE", "MELEE_TEST", "WEAPON_RANGE", "rangeTargets", "rangeStats", "SeedRangeTargets", "MaintainRangeTargets", "SpawnRangeTarget",
    "meleeTargets", "meleeScenario", "meleeLab", "MeleeLab", "StartMeleeScenario", "SeedMeleeTargets", "MaintainMeleeTargets", "MeleeSnapshot", "MeleePreviewPose",
  ];
  for (const name of banned) Check(!new RegExp(`\\b${name}\\b`).test(main), `Script_Main 与每帧系统不再出现 ${name}（接线在 Script_SandboxRanges）`);
  Check(/dt = ctx\.clock\.Step\(realDt\)/.test(modes), "帧头（Script_FrameModes.BeginFrame）只向玩法时钟要这一帧的时间");
  Check(!/\bdt\s*=\s*[\w.]+\.ScaleDt\(dt\)|\bdt\s*\*=/.test(main), "Script_Main 与每帧系统里不再有各自改 dt 的那几行");
}

// 4. 只接声明过的钩子；常驻取证口
{
  let current = null;
  const stubs = SandboxDebugStubs(() => current);
  Check(stubs.Explosions.State() === null, "不在爆炸场时 Debug.Explosions.State() 是 null");
  current = { id: "explosions", api: { State: () => ({ ok: 1 }), GoTo: () => "went", Reset: () => "reset" } };
  Check(stubs.Explosions.State().ok === 1 && stubs.Explosions.GoTo("a") === "went", "在爆炸场时转给插件");
  const expectedHooks = {
    firstLevelScenePreview: ["UpdateCamera"], dugoutAidOpenFields: ["UpdateCamera"],
    gengjiazhuangFieldApproach: ["UpdateCamera"], gengjiazhuangEastSmoke: ["UpdateCamera"],
    tanketteAdvanceEastTrack: ["UpdateCamera"], aircraftEvacuationDitch: ["UpdateCamera"],
    encounterPlay: ["ScaleDt", "CapturesInput", "ApplyCamera"],
    cloth: ["UpdateCamera"], hair: ["UpdateCamera"], tracks: ["UpdateCamera"],
    impacts: ["ScaleDt", "CapturesInput", "ApplyCamera"],
    reactions: ["ScaleDt"], gore: ["ScaleDt", "CapturesInput", "ApplyCamera"],
  };
  const pluginSourceFile = {
    encounterPlay: "Script_SandboxPlugin_EncounterPlay.mjs",
    firstLevelScenePreview: "Script_SandboxPlugin_SceneryPreview.mjs",
    dugoutAidOpenFields: "Script_SandboxPlugin_SceneryPreview.mjs",
    gengjiazhuangFieldApproach: "Script_SandboxPlugin_SceneryPreview.mjs",
    gengjiazhuangEastSmoke: "Script_SandboxPlugin_SceneryPreview.mjs",
    tanketteAdvanceEastTrack: "Script_SandboxPlugin_SceneryPreview.mjs",
    aircraftEvacuationDitch: "Script_SandboxPlugin_SceneryPreview.mjs",
    movement: "Script_SandboxPlugin_Movement.mjs",
    weapons: "Script_SandboxPlugin_Weapons.mjs",
    range: "Script_SandboxPlugin_Range.mjs",
    explosions: "Script_SandboxPlugin_Explosions.mjs",
    melee: "Script_SandboxPlugin_Melee.mjs",
    gore: "Script_SandboxPlugin_Gore.mjs",
    impacts: "Script_SandboxPlugin_Impacts.mjs",
    reactions: "Script_SandboxPlugin_Reactions.mjs",
    cloth: "Script_SandboxPlugin_Cloth.mjs",
    hair: "Script_SandboxPlugin_Hair.mjs",
    tracks: "Script_SandboxPlugin_Tracks.mjs",
  };
  for (const plugin of SANDBOX_PLUGINS) {
    const body = fs.readFileSync(path.join(dirHere, pluginSourceFile[plugin.id]), "utf8");
    for (const hook of ["ScaleDt", "CapturesInput", "ApplyCamera", "UpdateCamera"]) {
      const declared = new RegExp(`\\b${hook}:`).test(body);
      Check(declared === (expectedHooks[plugin.id] || []).includes(hook), `${plugin.id}: ${declared ? "接" : "不接"} ${hook}（与改造前装配层调用的一致）`);
    }
  }
}

// 5. 靶场与白刃实验场的运行时：取证口名字与改造前一致，白刃实验场交回装配层要调的那几只钩子
{
  const range = fs.readFileSync(new URL("./Script_RangeTargets.mjs", import.meta.url), "utf8");
  const melee = fs.readFileSync(new URL("./Script_MeleeLabRuntime.mjs", import.meta.url), "utf8");
  Check(/debugName: "Range", api, Maintain: MaintainRangeTargets/.test(range), "靶场：取证口仍叫 Debug.Range，补兵节拍复位木桩兵");
  Check(/debugName: "MeleeCombat", api/.test(melee), "白刃实验场：取证口仍叫 Debug.MeleeCombat");
  for (const hook of ["holdsRespawn", "OnPlayerDown", "Maintain", "BeforeMeleeUpdate", "AfterMeleeUpdate", "PreviewPose", "OnKey", "ActionPrompts", "UpdatePanel"])
    Check(new RegExp(`^    ${hook}[:(]`, "m").test(melee), `白刃实验场交回钩子 ${hook}`);
  for (const [id, fields] of Object.entries({ weapons: { targetDetail: false, steadyView: true }, melee: { identify: false, bayonetFixed: true, meleeAnimations: true } }))
    for (const [field, value] of Object.entries(fields)) Check(SANDBOX_RANGES.find((r) => r.id === id)[field] === value, `${id}.${field} = ${value}（原来装配层按测试场名字判断的那一处）`);
}

console.log(`[sandbox] 测试场登记表 / 按需插件 / 独立场景 / 玩法时钟：${checks} 条全过（${SANDBOX_PLUGINS.length} 个测试场，${checkedScenes.size} 份独立测试场景）`);
